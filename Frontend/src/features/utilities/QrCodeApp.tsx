import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  QrCode,
  Sparkles,
  Trash2,
} from "lucide-react";
import QRCodeStyling from "qr-code-styling";
import type {
  CornerDotType,
  CornerSquareType,
  DotType,
  ErrorCorrectionLevel,
  Options as QRCodeStylingOptions,
  ShapeType,
} from "qr-code-styling";
import { Button, Card, CardContent } from "../../components/ui";
import { UtilityAppFrame } from "./UtilityAppFrame";
import { copyText, downloadBlob } from "./utility-helpers";

const dotStyles: Array<{ value: DotType; label: string }> = [
  { value: "square", label: "Vuông" },
  { value: "dots", label: "Chấm tròn" },
  { value: "rounded", label: "Bo tròn" },
  { value: "extra-rounded", label: "Bo tròn nhiều" },
  { value: "classy", label: "Thanh lịch" },
  { value: "classy-rounded", label: "Thanh lịch bo tròn" },
];

const cornerSquareStyles: Array<{ value: CornerSquareType; label: string }> = [
  { value: "square", label: "Vuông" },
  { value: "dot", label: "Tròn" },
  { value: "extra-rounded", label: "Bo tròn" },
];

const cornerDotStyles: Array<{ value: CornerDotType; label: string }> = [
  { value: "dot", label: "Tròn" },
  { value: "square", label: "Vuông" },
];

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Không đọc được ảnh logo."));
    reader.onerror = () => reject(new Error("Không đọc được ảnh logo."));
    reader.readAsDataURL(file);
  });
}

export function QrCodeApp() {
  const previewRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [foreground, setForeground] = useState("#0f766e");
  const [background, setBackground] = useState("#ffffff");
  const [dotStyle, setDotStyle] = useState<DotType>("rounded");
  const [cornerSquare, setCornerSquare] = useState<CornerSquareType>("extra-rounded");
  const [cornerDot, setCornerDot] = useState<CornerDotType>("dot");
  const [shape, setShape] = useState<ShapeType>("square");
  const [errorCorrection, setErrorCorrection] = useState<ErrorCorrectionLevel>("Q");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [logoName, setLogoName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const container = previewRef.current;
    const data = value.trim();
    if (!container) return;
    if (!data) {
      container.replaceChildren();
      qrCodeRef.current = null;
      return;
    }

    const options: Partial<QRCodeStylingOptions> = {
      type: "canvas",
      shape,
      width: 640,
      height: 640,
      margin: 16,
      data,
      qrOptions: { errorCorrectionLevel: logoDataUrl ? "H" : errorCorrection },
      dotsOptions: { color: foreground, type: dotStyle },
      cornersSquareOptions: { color: foreground, type: cornerSquare },
      cornersDotOptions: { color: foreground, type: cornerDot },
      backgroundOptions: { color: background },
      image: logoDataUrl || "",
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.2,
        margin: 5,
        saveAsBlob: true,
      },
    };

    try {
      setError("");
      if (qrCodeRef.current) {
        qrCodeRef.current.update(options);
      } else {
        qrCodeRef.current = new QRCodeStyling(options);
        qrCodeRef.current.append(container);
      }
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Không thể tạo mã QR từ nội dung này.");
    }
  }, [value, foreground, background, dotStyle, cornerSquare, cornerDot, shape, errorCorrection, logoDataUrl]);

  useEffect(() => () => {
    previewRef.current?.replaceChildren();
    qrCodeRef.current = null;
  }, []);

  const handleLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Logo cần là ảnh PNG, JPG hoặc WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh logo cần nhỏ hơn 5 MB.");
      event.target.value = "";
      return;
    }
    try {
      setLogoDataUrl(await fileToDataUrl(file));
      setLogoName(file.name);
    } catch (logoError) {
      setError(logoError instanceof Error ? logoError.message : "Không thể đọc ảnh logo.");
    } finally {
      event.target.value = "";
    }
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!value.trim()) {
      setError("Nhập nội dung cần mã hóa trước.");
      return;
    }
    if (!qrCodeRef.current) {
      setError("Chưa tạo được bản xem trước. Hãy kiểm tra nội dung và thử lại.");
      return;
    }
    try {
      qrCodeRef.current.update({ data: value.trim() });
      setNotice("Đã tạo mã QR với các tùy chỉnh hiện tại.");
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Không thể tạo mã QR từ nội dung này.");
    }
  };

  const handleDownload = async (format: "png" | "svg") => {
    if (!value.trim() || !qrCodeRef.current) {
      setError("Nhập nội dung để tạo mã QR trước khi tải.");
      return;
    }
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const rawData = await qrCodeRef.current.getRawData(format);
      if (!rawData) throw new Error("Không xuất được ảnh QR.");
      let blob: Blob;
      if (rawData instanceof Blob) {
        blob = rawData;
      } else {
        const bytes = new Uint8Array(rawData);
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        blob = new Blob([buffer], { type: format === "svg" ? "image/svg+xml" : `image/${format}` });
      }
      downloadBlob(blob, `ma-qr-tuy-chinh.${format}`);
      setNotice(`Đã tải mã QR dạng ${format.toUpperCase()}.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Không thể tải ảnh QR.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyText(value.trim());
      setNotice("Đã sao chép nội dung QR.");
      setError("");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Không thể sao chép nội dung.");
    }
  };

  const removeLogo = () => {
    setLogoDataUrl("");
    setLogoName("");
    setError("");
    setNotice("");
  };

  return (
    <UtilityAppFrame title="Tạo mã QR" description="Tùy chỉnh màu, kiểu chấm, góc mã và logo; tải ảnh PNG hoặc SVG.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border border-border/70">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="qr-content" className="block text-sm font-semibold text-text-primary">Nội dung mã QR</label>
                <textarea
                  id="qr-content"
                  rows={5}
                  maxLength={3000}
                  value={value}
                  onChange={(event) => { setValue(event.target.value); setError(""); setNotice(""); }}
                  placeholder="Dán đường dẫn, văn bản, email hoặc thông tin bạn muốn chia sẻ…"
                  className="w-full resize-y rounded-xl border border-border bg-white p-3.5 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>Tối đa 3.000 ký tự</span>
                  <span>{value.length.toLocaleString("vi-VN")} / 3.000</span>
                </div>
              </div>

              <section className="space-y-3 rounded-xl border border-border/70 bg-slate-50/60 p-4" aria-labelledby="qr-style-heading">
                <div>
                  <h2 id="qr-style-heading" className="text-sm font-semibold text-text-primary">Tùy chỉnh giao diện</h2>
                  <p className="mt-0.5 text-xs text-text-muted">Thay đổi và xem trước trực tiếp.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium text-text-secondary">
                    Kiểu chấm
                    <select value={dotStyle} onChange={(event) => setDotStyle(event.target.value as DotType)} className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-700">
                      {dotStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-text-secondary">
                    Kiểu góc lớn
                    <select value={cornerSquare} onChange={(event) => setCornerSquare(event.target.value as CornerSquareType)} className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-700">
                      {cornerSquareStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-text-secondary">
                    Tâm góc
                    <select value={cornerDot} onChange={(event) => setCornerDot(event.target.value as CornerDotType)} className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-700">
                      {cornerDotStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-text-secondary">
                    Hình dạng
                    <select value={shape} onChange={(event) => setShape(event.target.value as ShapeType)} className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-700">
                      <option value="square">Vuông</option>
                      <option value="circle">Tròn</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary">
                    Màu mã
                    <input aria-label="Màu mã QR" type="color" value={foreground} onChange={(event) => setForeground(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary">
                    Màu nền
                    <input aria-label="Màu nền QR" type="color" value={background} onChange={(event) => setBackground(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-text-secondary">
                    Chống lỗi
                    <select value={logoDataUrl ? "H" : errorCorrection} onChange={(event) => setErrorCorrection(event.target.value as ErrorCorrectionLevel)} disabled={Boolean(logoDataUrl)} className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none focus:border-brand-700 disabled:bg-slate-100">
                      <option value="M">Vừa</option>
                      <option value="Q">Cao</option>
                      <option value="H">Rất cao</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-3">
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleLogo(event)} className="hidden" />
                  {logoDataUrl ? (
                    <>
                      <img src={logoDataUrl} alt="Logo tải lên" className="h-10 w-10 rounded-lg border border-border bg-white object-contain p-1" />
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{logoName}</span>
                      <button type="button" onClick={removeLogo} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /> Gỡ logo</button>
                    </>
                  ) : (
                    <>
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><ImagePlus className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1 text-xs leading-5 text-text-secondary">Thêm logo PNG, JPG hoặc WebP vào giữa mã. Tối đa 5 MB.</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>Chọn logo</Button>
                    </>
                  )}
                </div>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="gap-2"><Sparkles className="h-4 w-4" /> Cập nhật mã QR</Button>
                {value.trim() && <Button type="button" variant="outline" onClick={() => void handleCopy()} className="gap-2"><Copy className="h-4 w-4" /> Sao chép nội dung</Button>}
              </div>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border border-border/70">
            <CardContent className="flex min-h-96 flex-col items-center justify-center p-5 text-center sm:p-6">
              {value.trim() ? (
                <>
                  <div className="max-w-full overflow-hidden rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
                    <div ref={previewRef} className="flex min-h-64 min-w-64 items-center justify-center [&>canvas]:!h-64 [&>canvas]:!w-64 [&>svg]:!h-64 [&>svg]:!w-64" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-text-primary">Bản xem trước</p>
                  <p className="mt-1 max-w-xs break-all text-xs text-text-muted">{value.trim().slice(0, 100)}{value.trim().length > 100 ? "…" : ""}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => void handleDownload("png")} isLoading={isBusy} className="gap-2"><Download className="h-4 w-4" /> PNG</Button>
                    <Button type="button" variant="outline" onClick={() => void handleDownload("svg")} disabled={isBusy} className="gap-2"><Download className="h-4 w-4" /> SVG</Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-sky-50 text-sky-700"><QrCode className="h-8 w-8" /></span>
                  <h2 className="mt-4 font-semibold text-text-primary">QR sẽ hiển thị ở đây</h2>
                  <p className="mt-1 max-w-xs text-sm leading-6 text-text-secondary">Nhập nội dung rồi tùy chỉnh màu, kiểu mã và logo.</p>
                </>
              )}
            </CardContent>
          </Card>
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-950">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /> Mã QR được tạo trong trình duyệt. Giữ tương phản cao để dễ quét; hãy thử quét lại mã sau khi thêm logo hoặc đổi màu.
          </div>
        </div>

        <div className="xl:col-span-2 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-5 text-emerald-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" /> Nội dung QR và ảnh logo chỉ được xử lý trên thiết bị; không gửi tới dịch vụ bên ngoài.
        </div>
      </div>
    </UtilityAppFrame>
  );
}
