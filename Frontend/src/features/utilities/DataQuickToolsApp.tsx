import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Download, FileSpreadsheet, Filter, RefreshCcw, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button, Card, CardContent } from "../../components/ui";
import { UtilityAppFrame } from "./UtilityAppFrame";
import { downloadBlob, safeFileBaseName } from "./utility-helpers";

type CellValue = string | number | boolean | Date | null;
type SheetData = Record<string, CellValue[][]>;

function cellText(value: CellValue) {
  if (value instanceof Date) return value.toLocaleDateString("vi-VN");
  return value === null || value === undefined ? "" : String(value);
}

function duplicateKey(row: CellValue[], selectedColumn: number | "all") {
  const values = selectedColumn === "all" ? row : [row[selectedColumn]];
  return values.map((value) => cellText(value).trim().toLocaleLowerCase("vi-VN")).join("\u001f");
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Du_lieu";
}

export function DataQuickToolsApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [sheetData, setSheetData] = useState<SheetData>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [search, setSearch] = useState("");
  const [duplicateColumn, setDuplicateColumn] = useState<number | "all">("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rows = sheetData[activeSheet] || [];
  const header = rows[0] || [];
  const bodyRows = rows.slice(1);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = Array.from({ length: columnCount }, (_, index) => cellText(header[index]).trim() || `Cột ${index + 1}`);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    if (!query) return bodyRows;
    return bodyRows.filter((row) => row.some((cell) => cellText(cell).toLocaleLowerCase("vi-VN").includes(query)));
  }, [bodyRows, search]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const parsed: SheetData = {};
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        if (!sheet) continue;
        const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as CellValue[][];
        parsed[name] = sheetRows.length > 0 ? sheetRows : [[""]];
      }
      if (Object.keys(parsed).length === 0) throw new Error("Tệp không có trang tính hoặc không có dữ liệu đọc được.");

      setFileName(file.name);
      setSheetData(parsed);
      setSheetNames(Object.keys(parsed));
      setActiveSheet(Object.keys(parsed)[0]);
      setSearch("");
      setDuplicateColumn("all");
      setNotice(`Đã mở ${file.name}. Dữ liệu được xử lý trong trình duyệt.`);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Không thể đọc tệp này.");
      setSheetData({});
      setSheetNames([]);
      setActiveSheet("");
      setFileName("");
    } finally {
      event.target.value = "";
    }
  };

  const handleRemoveDuplicates = () => {
    if (!activeSheet) return;
    const seen = new Set<string>();
    let removedCount = 0;
    const kept = bodyRows.filter((row) => {
      const key = duplicateKey(row, duplicateColumn);
      if (seen.has(key)) {
        removedCount += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
    setSheetData((current) => ({ ...current, [activeSheet]: [header, ...kept] }));
    setNotice(removedCount > 0 ? `Đã xóa ${removedCount} dòng trùng.` : "Không tìm thấy dòng trùng.");
  };

  const exportRows = [header, ...filteredRows];

  const handleExport = (format: "xlsx" | "csv") => {
    if (!activeSheet || exportRows.length === 0) return;
    const base = safeFileBaseName(fileName || "du-lieu");
    const sheet = XLSX.utils.aoa_to_sheet(exportRows);
    if (format === "xlsx") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(activeSheet));
      XLSX.writeFile(workbook, `${base}-${safeFileBaseName(activeSheet)}-da-xu-ly.xlsx`);
      setNotice(`Đã xuất ${filteredRows.length.toLocaleString("vi-VN")} dòng sang Excel.`);
      return;
    }

    // Prefix formula-like text in CSV files to reduce spreadsheet formula injection risk.
    const csvSafeRows = exportRows.map((row) => row.map((value) => {
      if (typeof value !== "string") return value;
      return /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
    }));
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(csvSafeRows));
    downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${base}-${safeFileBaseName(activeSheet)}-da-xu-ly.csv`);
    setNotice(`Đã xuất ${filteredRows.length.toLocaleString("vi-VN")} dòng sang CSV.`);
  };

  const clearFile = () => {
    setFileName("");
    setSheetData({});
    setSheetNames([]);
    setActiveSheet("");
    setSearch("");
    setNotice("");
    setError("");
  };

  return (
    <UtilityAppFrame title="Xử lý Excel / CSV nhanh" description="Lọc bảng, xóa dòng trùng và xuất dữ liệu đã chọn ngay trên trình duyệt.">
      <div className="space-y-5">
        <Card className="border border-border/70">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileSpreadsheet className="h-5 w-5" /></span>
              <div>
                <h2 className="font-semibold text-text-primary">Mở bảng dữ liệu</h2>
                <p className="mt-1 text-sm text-text-secondary">Hỗ trợ Excel (.xlsx, .xls) và CSV. Có thể chọn trang tính sau khi mở.</p>
                {fileName && <p className="mt-2 text-xs font-medium text-brand-700">{fileName}</p>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event)} className="hidden" />
              {fileName && <Button type="button" variant="outline" onClick={clearFile} className="gap-2"><Trash2 className="h-4 w-4" /> Đóng tệp</Button>}
              <Button type="button" onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Chọn tệp</Button>
            </div>
          </CardContent>
        </Card>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

        {fileName ? (
          <Card className="border border-border/70">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-wrap items-end gap-3">
                  {sheetNames.length > 1 && (
                    <label className="space-y-1.5 text-xs font-semibold text-text-secondary">
                      Trang tính
                      <select value={activeSheet} onChange={(event) => setActiveSheet(event.target.value)} className="block h-9 min-w-40 rounded-lg border border-border bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-700">
                        {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="relative block min-w-56 space-y-1.5 text-xs font-semibold text-text-secondary">
                    Lọc nội dung
                    <span className="relative block">
                      <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trong các cột…" className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm font-normal text-text-primary outline-none focus:border-brand-700" />
                    </span>
                  </label>
                  <label className="space-y-1.5 text-xs font-semibold text-text-secondary">
                    Xóa dòng trùng theo
                    <select value={duplicateColumn === "all" ? "all" : String(duplicateColumn)} onChange={(event) => setDuplicateColumn(event.target.value === "all" ? "all" : Number(event.target.value))} className="block h-9 min-w-40 rounded-lg border border-border bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-brand-700">
                      <option value="all">Toàn bộ dòng</option>
                      {headers.map((name, index) => <option key={`${index}-${name}`} value={index}>{name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handleRemoveDuplicates} className="gap-2" disabled={bodyRows.length < 2}>
                    <RefreshCcw className="h-4 w-4" /> Xóa dòng trùng
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => handleExport("csv")} className="gap-2">
                    <Download className="h-4 w-4" /> Tải CSV
                  </Button>
                  <Button type="button" onClick={() => handleExport("xlsx")} className="gap-2">
                    <Download className="h-4 w-4" /> Tải Excel
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                <span>Hiển thị {Math.min(filteredRows.length, 40).toLocaleString("vi-VN")} / {filteredRows.length.toLocaleString("vi-VN")} dòng khớp lọc · Tổng {bodyRows.length.toLocaleString("vi-VN")} dòng dữ liệu</span>
                <span>Tải tệp sẽ xuất dữ liệu đang lọc và giữ nguyên tiêu đề cột.</span>
              </div>

              {columnCount > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      <tr>
                        <th className="w-14 border-b border-border/70 px-3 py-3 text-right">#</th>
                        {headers.map((name, index) => <th key={`${index}-${name}`} className="max-w-64 border-b border-border/70 px-3 py-3">{name}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredRows.slice(0, 40).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-brand-50/30">
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums text-text-muted">{rowIndex + 1}</td>
                          {Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex} className="max-w-64 truncate px-3 py-2.5 text-text-primary" title={cellText(row[columnIndex])}>{cellText(row[columnIndex]) || <span className="text-text-muted">—</span>}</td>)}
                        </tr>
                      ))}
                      {filteredRows.length === 0 && <tr><td colSpan={columnCount + 1} className="px-4 py-10 text-center text-sm text-text-muted">Không có dòng dữ liệu khớp bộ lọc.</td></tr>}
                    </tbody>
                  </table>
                  {filteredRows.length > 40 && <p className="border-t border-border/70 bg-slate-50 px-4 py-2 text-center text-xs text-text-muted">Bản xem trước giới hạn 40 dòng đầu; tệp xuất chứa toàn bộ {filteredRows.length.toLocaleString("vi-VN")} dòng đang lọc.</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-muted">Trang tính chưa có dữ liệu.</div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 bg-white/60 px-6 py-12 text-center">
            <FileSpreadsheet className="mx-auto h-9 w-9 text-emerald-700" />
            <h2 className="mt-3 font-semibold text-text-primary">Chưa có tệp dữ liệu</h2>
            <p className="mt-1 text-sm text-text-secondary">Chọn một tệp Excel hoặc CSV để bắt đầu lọc và làm sạch dữ liệu.</p>
          </div>
        )}
      </div>
    </UtilityAppFrame>
  );
}
