import { useEffect, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import type { FileObject } from "../../shared/data-contract";
import { httpRepository, isMockMode } from "../../shared/repository";
import { getSessionFileUrl } from "./file-session-store";
import { Button } from "../../components/ui";

type Sheet = { name: string; rows: string[][] };
type Content =
  | { kind: "image" | "pdf"; url: string }
  | { kind: "docx"; html: string }
  | { kind: "excel"; sheets: Sheet[] }
  | { kind: "unsupported" };

type Props = {
  file: FileObject;
  onClose: () => void;
  onDownload: () => void;
  isDownloading: boolean;
};

function fileKind(file: FileObject): Content["kind"] {
  const extension = file.originalName.split(".").pop()?.toLowerCase();
  if (file.mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(extension ?? "")) return "image";
  if (file.mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "xlsx" || extension === "xls") return "excel";
  return "unsupported";
}

export function DocumentPreview({ file, onClose, onDownload, isDownloading }: Props) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setContent(null);
    setError(null);
    setActiveSheet(0);

    const load = async () => {
      const kind = fileKind(file);
      if (kind === "unsupported") {
        setContent({ kind });
        return;
      }
      const url = isMockMode
        ? getSessionFileUrl(file.id)
        : kind === "image" || kind === "pdf"
          ? await httpRepository.getPreviewUrl(file.id)
          : await httpRepository.getDownloadUrl(file.id);
      if (!url) throw new Error("Tệp chưa có dữ liệu để xem trước.");
      if (kind === "image" || kind === "pdf") {
        if (live) setContent({ kind, url });
        return;
      }

      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Không tải được tệp (HTTP ${response.status}).`);
      const bytes = await response.arrayBuffer();
      if (kind === "docx") {
        const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
          import("mammoth"),
          import("dompurify"),
        ]);
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes });
        if (live) setContent({ kind, html: DOMPurify.sanitize(result.value) });
      } else {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(bytes, { type: "array" });
        const sheets = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const bounds = XLSX.utils.decode_range(sheet["!ref"] || "A1");
          bounds.e.r = Math.min(bounds.e.r, bounds.s.r + 199);
          bounds.e.c = Math.min(bounds.e.c, bounds.s.c + 29);
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            range: bounds,
            raw: false,
            defval: "",
          }).map((row) => row.map((cell) => String(cell ?? "")));
          return { name, rows };
        });
        if (live) setContent({ kind, sheets });
      }
    };

    void load().catch((loadError: unknown) => {
      if (live && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Không mở được tệp.");
      }
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [file]);

  const sheet = content?.kind === "excel" ? content.sheets[activeSheet] : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Xem tệp ${file.originalName}`} className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <FileText className="h-5 w-5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-text-primary">{file.originalName}</h2>
            <p className="text-xs text-text-muted">Xem tài liệu trong ứng dụng</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={isDownloading} onClick={onDownload} className="gap-1.5"><Download className="h-3.5 w-3.5" /> Tải về</Button>
          <button type="button" aria-label="Đóng bản xem trước" onClick={onClose} className="rounded p-2 text-text-muted hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
          {error ? <div role="alert" className="rounded-lg border border-red-200 bg-white p-6 text-sm text-red-700">{error} Bạn có thể tải tệp về để mở.</div>
            : !content ? <p className="text-center text-sm text-text-secondary">Đang mở tài liệu…</p>
              : content.kind === "image" ? <img src={content.url} alt={file.originalName} className="mx-auto max-h-full max-w-full rounded object-contain shadow" />
                : content.kind === "pdf" ? <iframe src={content.url} title={`Bản xem trước ${file.originalName}`} className="h-full min-h-[70vh] w-full rounded border border-border bg-white" />
                  : content.kind === "docx" ? <article className="mx-auto max-w-4xl rounded-lg bg-white p-6 text-sm leading-7 shadow-sm sm:p-10 [&_h1]:mb-4 [&_h1]:text-xl [&_h2]:mb-3 [&_h2]:text-lg [&_img]:max-w-full [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_table]:mb-4 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2" dangerouslySetInnerHTML={{ __html: content.html }} />
                    : content.kind === "excel" ? <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">{content.sheets.map((item, index) => <button type="button" key={`${item.name}-${index}`} onClick={() => setActiveSheet(index)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeSheet === index ? "bg-brand-700 text-white" : "bg-white text-text-secondary"}`}>{item.name}</button>)}</div>
                        <div className="overflow-auto rounded-lg border border-border bg-white shadow-sm"><table className="min-w-full border-collapse text-left text-xs"><tbody>{sheet?.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border/70"><th className="sticky left-0 bg-slate-50 px-3 py-2 font-medium text-text-muted">{rowIndex + 1}</th>{row.map((cell, cellIndex) => <td key={cellIndex} className="min-w-24 border-l border-border/70 px-3 py-2 align-top whitespace-pre-wrap">{cell}</td>)}</tr>)}</tbody></table></div>
                        <p className="text-xs text-text-muted">Đang hiển thị tối đa 200 hàng và 30 cột mỗi trang tính. Tải tệp về để xem toàn bộ.</p>
                      </div>
                      : <div className="rounded-lg border border-border bg-white p-6 text-center text-sm text-text-secondary">Định dạng này chưa hỗ trợ xem trực tiếp. Bạn có thể tải tệp về để mở.</div>}
        </div>
      </section>
    </div>
  );
}
