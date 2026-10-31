import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Download, FileImage, FilePlus2, Files, Images, Scissors, Trash2, Upload } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { UtilityAppFrame } from "./UtilityAppFrame";
import { downloadBlob, safeFileBaseName } from "./utility-helpers";

type PdfMode = "merge" | "extract" | "images";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parsePageRanges(input: string, pageCount: number) {
  const pages: number[] = [];
  const seen = new Set<number>();
  const segments = input.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0) throw new Error("Nhập ít nhất một số trang hoặc khoảng trang.");

  for (const segment of segments) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(segment);
    if (!match) throw new Error(`Khoảng trang “${segment}” không đúng định dạng.`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Trang phải nằm trong khoảng 1–${pageCount}.`);
    }
    for (let page = start; page <= end; page += 1) {
      if (!seen.has(page)) {
        pages.push(page - 1);
        seen.add(page);
      }
    }
  }

  return pages;
}

function imageFormat(file: File): "png" | "jpg" | "webp" | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "image/png" || extension === "png") return "png";
  if (file.type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return "jpg";
  if (file.type === "image/webp" || extension === "webp") return "webp";
  return null;
}

async function convertWebpToPng(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không hỗ trợ chuyển đổi ảnh WebP.");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Không thể chuyển ảnh WebP sang PNG.")), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function embedImageInPdf(document: import("pdf-lib").PDFDocument, file: File) {
  const format = imageFormat(file);
  if (!format) throw new Error(`${file.name} không phải ảnh PNG, JPG hoặc WebP được hỗ trợ.`);
  if (format === "webp") return document.embedPng(await convertWebpToPng(file));

  const bytes = new Uint8Array(await file.arrayBuffer());
  return format === "jpg" ? document.embedJpg(bytes) : document.embedPng(bytes);
}

export function PdfMiniApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<PdfMode>("merge");
  const [files, setFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pageRange, setPageRange] = useState("1");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (mode !== "extract" || !files[0]) {
      setPageCount(null);
      return;
    }

    let cancelled = false;
    setPageCount(null);
    void files[0].arrayBuffer()
      .then((bytes) => import("pdf-lib").then(({ PDFDocument }) => PDFDocument.load(bytes)))
      .then((document) => {
        if (!cancelled) setPageCount(document.getPageCount());
      })
      .catch(() => {
        if (!cancelled) setError("Không đọc được tệp PDF này. Tệp có thể bị lỗi hoặc được bảo vệ bằng mật khẩu.");
      });

    return () => {
      cancelled = true;
    };
  }, [files, mode]);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setError("");
    setSuccess("");

    const invalid = selected.find((file) => !file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf");
    if (invalid) {
      setError(`${invalid.name} không phải tệp PDF.`);
      event.target.value = "";
      return;
    }
    const oversized = selected.find((file) => file.size > 150 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} vượt quá giới hạn 150 MB cho mỗi tệp.`);
      event.target.value = "";
      return;
    }
    setFiles(selected);
    setPageCount(null);
  };

  const clearFiles = () => {
    setFiles([]);
    setPageCount(null);
    setError("");
    setSuccess("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setError("");
    setSuccess("");
    const invalid = selected.find((file) => !imageFormat(file));
    if (invalid) {
      setError(`${invalid.name} không được hỗ trợ. Chọn ảnh PNG, JPG hoặc WebP.`);
      event.target.value = "";
      return;
    }
    const oversized = selected.find((file) => file.size > MAX_IMAGE_BYTES);
    if (oversized) {
      setError(`${oversized.name} vượt quá giới hạn 50 MB cho mỗi ảnh.`);
      event.target.value = "";
      return;
    }
    setImageFiles(selected);
  };

  const clearImages = () => {
    setImageFiles([]);
    setError("");
    setSuccess("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleProcess = async () => {
    if (mode === "images" && imageFiles.length === 0) {
      setError("Chọn ít nhất một ảnh PNG, JPG hoặc WebP.");
      return;
    }
    if (mode !== "images" && files.length === 0) {
      setError(mode === "merge" ? "Chọn ít nhất một tệp PDF để gộp." : "Chọn một tệp PDF để tách trang.");
      return;
    }

    setIsBusy(true);
    setError("");
    setSuccess("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const output = await PDFDocument.create();

      if (mode === "images") {
        const margin = 32;
        for (const file of imageFiles) {
          const image = await embedImageInPdf(output, file);
          const landscape = image.width > image.height;
          const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
          const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
          const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          const page = output.addPage([pageWidth, pageHeight]);
          page.drawImage(image, {
            x: (pageWidth - width) / 2,
            y: (pageHeight - height) / 2,
            width,
            height,
          });
        }
      } else if (mode === "merge") {
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer());
          const pages = await output.copyPages(source, source.getPageIndices());
          pages.forEach((page) => output.addPage(page));
        }
      } else {
        const source = await PDFDocument.load(await files[0].arrayBuffer());
        const pageIndices = parsePageRanges(pageRange, source.getPageCount());
        const pages = await output.copyPages(source, pageIndices);
        pages.forEach((page) => output.addPage(page));
      }

      const bytes = await output.save();
      const blobBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(blobBuffer).set(bytes);
      const baseName = safeFileBaseName(mode === "images" ? imageFiles[0].name : files[0].name);
      const outputName = mode === "images"
        ? `${baseName}-anh.pdf`
        : mode === "merge" ? `${baseName}-da-gop.pdf` : `${baseName}-trang-da-chon.pdf`;
      downloadBlob(new Blob([blobBuffer], { type: "application/pdf" }), outputName);
      setSuccess(mode === "images"
        ? `Đã đưa ${imageFiles.length} ảnh vào PDF.`
        : mode === "merge" ? `Đã gộp ${files.length} tệp PDF.` : "Đã tạo PDF từ các trang đã chọn.");
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Không thể xử lý tệp PDF.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <UtilityAppFrame title="PDF mini" description="Gộp PDF, tách trang hoặc chuyển ảnh thành PDF ngay trên thiết bị.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="border border-border/70">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Chế độ xử lý PDF">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "merge"}
                onClick={() => { setMode("merge"); setError(""); setSuccess(""); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "merge" ? "bg-white text-brand-700 shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                <Files className="h-4 w-4" /> Gộp PDF
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "extract"}
                onClick={() => { setMode("extract"); setError(""); setSuccess(""); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "extract" ? "bg-white text-brand-700 shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                <Scissors className="h-4 w-4" /> Tách trang
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "images"}
                onClick={() => { setMode("images"); setError(""); setSuccess(""); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "images" ? "bg-white text-brand-700 shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                <Images className="h-4 w-4" /> Ảnh → PDF
              </button>
            </div>

            {mode !== "images" ? <div>
              <label htmlFor="pdf-files" className="mb-2 block text-sm font-semibold text-text-primary">
                {mode === "merge" ? "Chọn các tệp theo thứ tự muốn gộp" : "Chọn tệp PDF cần trích trang"}
              </label>
              <input
                ref={fileInputRef}
                id="pdf-files"
                type="file"
                accept="application/pdf,.pdf"
                multiple={mode === "merge"}
                onChange={handleFiles}
                className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:border-brand-300"
              />
              <p className="mt-2 text-xs text-text-muted">Mỗi tệp tối đa 150 MB. Tệp được xử lý ngay trên thiết bị của bạn.</p>
            </div> : (
              <div>
                <label htmlFor="image-files" className="mb-2 block text-sm font-semibold text-text-primary">Chọn ảnh theo thứ tự muốn đưa vào PDF</label>
                <input
                  ref={imageInputRef}
                  id="image-files"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  multiple
                  onChange={handleImages}
                  className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:border-brand-300"
                />
                <p className="mt-2 text-xs text-text-muted">Hỗ trợ PNG, JPG và WebP; mỗi ảnh tối đa 50 MB. Mỗi ảnh thành một trang A4, tự xoay trang để vừa ảnh.</p>
              </div>
            )}

            {mode === "extract" && files[0] && (
              <div className="max-w-sm space-y-2">
                <label htmlFor="pdf-page-range" className="block text-sm font-semibold text-text-primary">Trang cần lấy</label>
                <input
                  id="pdf-page-range"
                  value={pageRange}
                  onChange={(event) => setPageRange(event.target.value)}
                  placeholder="Ví dụ: 1-3, 5, 8-10"
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
                />
                <p className="text-xs text-text-muted">
                  {pageCount === null ? "Đang đọc số trang…" : `Tệp có ${pageCount} trang. Dùng dấu phẩy để chọn nhiều trang hoặc khoảng trang.`}
                </p>
              </div>
            )}

            {mode === "images" && imageFiles.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border/70 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{imageFiles.length} ảnh đã chọn</p>
                  <button type="button" onClick={clearImages} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa
                  </button>
                </div>
                <ul className="divide-y divide-border/70">
                  {imageFiles.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><FileImage className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 truncate text-text-primary">{index + 1}. {file.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">{formatFileSize(file.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mode !== "images" && files.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border/70 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{files.length} tệp đã chọn</p>
                  <button type="button" onClick={clearFiles} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa
                  </button>
                </div>
                <ul className="divide-y divide-border/70">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700"><FilePlus2 className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 truncate text-text-primary">{mode === "merge" ? `${index + 1}. ` : ""}{file.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">{formatFileSize(file.size)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              <Button type="button" onClick={() => void handleProcess()} isLoading={isBusy} className="gap-2">
                {mode === "images" ? <Images className="h-4 w-4" /> : mode === "merge" ? <Files className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {isBusy ? "Đang xử lý…" : mode === "images" ? "Tạo PDF từ ảnh" : mode === "merge" ? "Gộp và tải PDF" : "Tạo PDF trang đã chọn"}
              </Button>
              <Button type="button" variant="outline" onClick={() => mode === "images" ? imageInputRef.current?.click() : fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Chọn tệp
              </Button>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="border border-border/70">
            <CardContent className="space-y-3 p-5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-700">{mode === "images" ? <Images className="h-5 w-5" /> : <Files className="h-5 w-5" />}</div>
              <h2 className="font-semibold text-text-primary">Cách dùng</h2>
              {mode === "images" ? (
                <ol className="list-inside list-decimal space-y-2 text-sm leading-6 text-text-secondary">
                  <li>Chọn một hoặc nhiều ảnh PNG, JPG hoặc WebP.</li>
                  <li>Mỗi ảnh được đặt vừa trong một trang A4, giữ nguyên tỷ lệ và thứ tự.</li>
                  <li>Tệp PDF được tạo trong trình duyệt rồi tải về máy.</li>
                </ol>
              ) : (
                <ol className="list-inside list-decimal space-y-2 text-sm leading-6 text-text-secondary">
                  <li>Chọn gộp PDF hoặc tách trang.</li>
                  <li>Với chế độ gộp, thứ tự tệp được giữ như danh sách đã chọn.</li>
                  <li>Với chế độ tách, nhập trang như <span className="font-mono text-xs">1-3, 5, 8-10</span>.</li>
                  <li>Tệp kết quả sẽ được tải xuống máy.</li>
                </ol>
              )}
            </CardContent>
          </Card>
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-text-secondary">
            <Upload className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> Tệp được xử lý trong trình duyệt và không được tải lên máy chủ.
          </div>
        </aside>
      </div>
    </UtilityAppFrame>
  );
}
