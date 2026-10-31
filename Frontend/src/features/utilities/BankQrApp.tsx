import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, FormEvent, KeyboardEvent } from "react";
import { Building2, CheckCircle2, Download, ExternalLink, Landmark, QrCode, RefreshCcw, Search } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { UtilityAppFrame } from "./UtilityAppFrame";
import { downloadBlob, safeFileBaseName } from "./utility-helpers";

const BANKS_API = "https://api.vietqr.io/v2/banks";
const VIETQR_IMAGE_BASE = "https://img.vietqr.io/image";

type VietQrBank = {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string;
  transferSupported: number;
};

type VietQrBanksResponse = {
  code?: string;
  desc?: string;
  data?: VietQrBank[];
};

type VietQrTemplate = "compact2" | "compact" | "qr_only" | "print";

function normalizeBankSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").trim();
}

function makeVietQrUrl(bankCode: string, accountNumber: string, template: VietQrTemplate, amount: string, content: string, accountName: string) {
  const encodedBankCode = encodeURIComponent(bankCode);
  const encodedAccountNumber = encodeURIComponent(accountNumber);
  const url = new URL(`${VIETQR_IMAGE_BASE}/${encodedBankCode}-${encodedAccountNumber}-${template}.svg`);
  if (amount.trim()) url.searchParams.set("amount", amount.trim());
  if (content.trim()) url.searchParams.set("addInfo", content.trim());
  if (accountName.trim()) url.searchParams.set("accountName", accountName.trim());
  return url.toString();
}

export function BankQrApp() {
  const [banks, setBanks] = useState<VietQrBank[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [bankLoadError, setBankLoadError] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [isBankListOpen, setIsBankListOpen] = useState(false);
  const [activeBankIndex, setActiveBankIndex] = useState(0);
  const [manualBankCode, setManualBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<VietQrTemplate>("compact2");
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBank = useMemo(() => banks.find((bank) => bank.code === bankCode), [banks, bankCode]);
  const filteredBanks = useMemo(() => {
    const query = normalizeBankSearch(bankQuery);
    if (!query) return banks;
    return banks.filter((bank) => normalizeBankSearch(`${bank.shortName} ${bank.name} ${bank.code} ${bank.bin}`).includes(query));
  }, [banks, bankQuery]);

  const chooseBank = (bank: VietQrBank) => {
    setBankCode(bank.code);
    setBankQuery("");
    setIsBankListOpen(false);
    setActiveBankIndex(0);
    clearGeneratedQr();
  };

  const handleBankSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsBankListOpen(true);
      setActiveBankIndex((current) => Math.min(Math.max(filteredBanks.length - 1, 0), current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsBankListOpen(true);
      setActiveBankIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && isBankListOpen && filteredBanks[activeBankIndex]) {
      event.preventDefault();
      chooseBank(filteredBanks[activeBankIndex]);
    } else if (event.key === "Escape") {
      setIsBankListOpen(false);
      setBankQuery("");
    }
  };

  const handleBankPickerBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsBankListOpen(false);
  };

  const clearGeneratedQr = () => {
    setImageUrl("");
    setImageError("");
    setNotice("");
  };

  const loadBanks = async (signal?: AbortSignal) => {
    setIsLoadingBanks(true);
    setBankLoadError("");
    try {
      const response = await fetch(BANKS_API, { signal });
      if (!response.ok) throw new Error(`Danh sách ngân hàng phản hồi HTTP ${response.status}.`);
      const payload = await response.json() as VietQrBanksResponse;
      if (payload.code && payload.code !== "00") throw new Error(payload.desc || "Không tải được danh sách ngân hàng.");
      if (!Array.isArray(payload.data) || payload.data.length === 0) throw new Error("Danh sách ngân hàng trống.");
      const supported = payload.data
        .filter((bank) => bank.transferSupported !== 0)
        .sort((a, b) => a.shortName.localeCompare(b.shortName, "vi"));
      setBanks(supported);
      setBankCode((current) => current || supported[0]?.code || "");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setBankLoadError(loadError instanceof Error ? loadError.message : "Không thể tải ngân hàng.");
    } finally {
      if (!signal?.aborted) setIsLoadingBanks(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadBanks(controller.signal);
    return () => controller.abort();
  }, []);

  const handleGenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setImageError("");

    const effectiveBankCode = bankCode === "__manual__" ? manualBankCode.trim() : bankCode;
    const trimmedAccountNumber = accountNumber.trim();
    const trimmedAmount = amount.trim();
    if (!effectiveBankCode) {
      setError("Chọn ngân hàng hoặc nhập mã ngân hàng VietQR.");
      return;
    }
    if (!/^[A-Za-z0-9]{2,12}$/.test(effectiveBankCode)) {
      setError("Mã ngân hàng chỉ gồm 2–12 chữ cái hoặc chữ số.");
      return;
    }
    if (!/^[A-Za-z0-9]{1,19}$/.test(trimmedAccountNumber)) {
      setError("Số tài khoản hoặc biệt danh cần có tối đa 19 chữ cái hoặc chữ số.");
      return;
    }
    if (trimmedAmount && (!/^\d{1,13}$/.test(trimmedAmount) || Number(trimmedAmount) < 1)) {
      setError("Số tiền phải là số nguyên dương, tối đa 13 chữ số.");
      return;
    }
    if (content.trim() && !/^[\p{L}\p{N} ]{1,50}$/u.test(content.trim())) {
      setError("Nội dung chuyển khoản tối đa 50 ký tự chữ, số và khoảng trắng; không dùng ký tự đặc biệt.");
      return;
    }

    setImageUrl(makeVietQrUrl(effectiveBankCode, trimmedAccountNumber, template, trimmedAmount, content, accountName));
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("VietQR không trả về được ảnh QR.");
      const imageBlob = await response.blob();
      downloadBlob(imageBlob, `vietqr-${safeFileBaseName(accountNumber)}.svg`);
    } catch {
      setNotice("Không tải trực tiếp được ảnh từ VietQR. Đã mở ảnh gốc ở tab mới để bạn có thể lưu về máy.");
      window.open(imageUrl, "_blank", "noopener,noreferrer");
    }
  };

  const effectiveBankCode = bankCode === "__manual__" ? manualBankCode.trim() : bankCode;

  return (
    <UtilityAppFrame title="Tạo QR ngân hàng" description="Tạo mã VietQR cho tài khoản nhận tiền, kèm số tiền và nội dung chuyển khoản.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border border-border/70">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-text-primary">Thông tin nhận tiền</h2>
                  <p className="mt-1 text-sm text-text-secondary">Các trường có dấu * là bắt buộc.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadBanks()} isLoading={isLoadingBanks} className="gap-1.5">
                  <RefreshCcw className="h-3.5 w-3.5" /> Tải ngân hàng
                </Button>
              </div>

              {!bankLoadError ? (
                <div className="space-y-1.5 text-sm font-medium text-text-primary" onBlur={handleBankPickerBlur}>
                  <label htmlFor="vietqr-bank-search">Ngân hàng *</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      id="vietqr-bank-search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={isBankListOpen}
                      aria-controls="vietqr-bank-options"
                      aria-activedescendant={isBankListOpen && filteredBanks[activeBankIndex] ? `vietqr-bank-option-${filteredBanks[activeBankIndex].id}` : undefined}
                      value={isBankListOpen ? bankQuery : (selectedBank ? `${selectedBank.shortName} · ${selectedBank.name}` : "")}
                      onFocus={() => { setBankQuery(""); setIsBankListOpen(true); setActiveBankIndex(0); }}
                      onClick={() => setIsBankListOpen(true)}
                      onChange={(event) => { setBankQuery(event.target.value); setIsBankListOpen(true); setActiveBankIndex(0); }}
                      onKeyDown={handleBankSearchKeyDown}
                      disabled={isLoadingBanks || banks.length === 0}
                      placeholder={isLoadingBanks ? "Đang tải danh sách ngân hàng…" : "Tìm theo tên, viết tắt hoặc mã BIN"}
                      className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm font-normal outline-none focus:border-brand-700 disabled:bg-slate-50"
                    />
                    {isBankListOpen && !isLoadingBanks && (
                      <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-white p-1 shadow-lg" role="listbox" id="vietqr-bank-options" aria-label="Danh sách ngân hàng">
                        {filteredBanks.length > 0 ? filteredBanks.map((bank, index) => (
                          <button
                            key={bank.id}
                            id={`vietqr-bank-option-${bank.id}`}
                            type="button"
                            role="option"
                            aria-selected={bank.code === bankCode}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveBankIndex(index)}
                            onClick={() => chooseBank(bank)}
                            className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-normal ${index === activeBankIndex ? "bg-brand-50 text-brand-800" : "text-text-primary hover:bg-slate-50"}`}
                          >
                            <span className="block font-medium">{bank.shortName}</span>
                            <span className="mt-0.5 block text-xs text-text-secondary">{bank.name} · {bank.code} · BIN {bank.bin}</span>
                          </button>
                        )) : (
                          <div className="px-3 py-3 text-sm font-normal text-text-secondary">
                            <p>Không tìm thấy ngân hàng phù hợp.</p>
                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setBankCode("__manual__"); setBankQuery(""); setIsBankListOpen(false); clearGeneratedQr(); }} className="mt-2 font-medium text-brand-700 hover:underline">Nhập mã VietQR thủ công</button>
                          </div>
                        )}
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setBankCode("__manual__"); setBankQuery(""); setIsBankListOpen(false); clearGeneratedQr(); }} className="mt-1 w-full rounded-lg border-t border-border px-3 py-2.5 text-left text-xs font-medium text-brand-700 hover:bg-slate-50">Nhập mã ngân hàng khác…</button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-normal text-text-muted" aria-live="polite">{isBankListOpen ? `${filteredBanks.length} ngân hàng phù hợp · có thể tìm theo tên, viết tắt hoặc mã BIN` : ""}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Không tải được danh sách ngân hàng. Bạn vẫn có thể nhập mã VietQR, ví dụ mã viết tắt hiển thị trong tài liệu ngân hàng.</p>
                  <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                    Mã ngân hàng *
                    <input value={manualBankCode} onChange={(event) => { setManualBankCode(event.target.value); clearGeneratedQr(); }} placeholder="Ví dụ: ICB" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                  </label>
                </div>
              )}
              {bankCode === "__manual__" && !bankLoadError && (
                <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                  Mã ngân hàng VietQR *
                  <input value={manualBankCode} onChange={(event) => { setManualBankCode(event.target.value); clearGeneratedQr(); }} placeholder="Ví dụ: ICB" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                </label>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                  Số tài khoản *
                  <input autoComplete="off" maxLength={19} value={accountNumber} onChange={(event) => { setAccountNumber(event.target.value.replace(/[^A-Za-z0-9]/g, "")); clearGeneratedQr(); }} placeholder="Số tài khoản hoặc biệt danh" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                </label>
                <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                  Tên người nhận
                  <input value={accountName} onChange={(event) => { setAccountName(event.target.value.slice(0, 70)); clearGeneratedQr(); }} placeholder="Tên hiển thị trên mã QR" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                  Số tiền (đồng)
                  <input inputMode="numeric" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/\D/g, "").slice(0, 13)); clearGeneratedQr(); }} placeholder="Để trống nếu người chuyển tự nhập" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                </label>
                <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                  Mẫu ảnh
                  <select value={template} onChange={(event) => { setTemplate(event.target.value as VietQrTemplate); clearGeneratedQr(); }} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700">
                    <option value="compact2">Compact 2 · có thông tin</option>
                    <option value="compact">Compact</option>
                    <option value="qr_only">Chỉ mã QR</option>
                    <option value="print">Bản in</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium text-text-primary">
                Nội dung chuyển khoản
                <input value={content} maxLength={50} onChange={(event) => { setContent(event.target.value.slice(0, 50)); clearGeneratedQr(); }} placeholder="Ví dụ: Thanh toan ho so 123" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-700" />
                <span className="block text-xs font-normal text-text-muted">Tối đa 50 ký tự chữ, số và khoảng trắng. Có thể để trống nếu nội dung thay đổi theo từng lần chuyển.</span>
              </label>

              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

              <div className="border-t border-border/70 pt-4">
                <Button type="submit" className="gap-2"><QrCode className="h-4 w-4" /> Tạo mã VietQR</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border border-border/70">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-5 text-center sm:p-6">
              {imageUrl ? (
                <>
                  <div className="w-full max-w-xs rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
                    <img src={imageUrl} alt="Mã VietQR nhận chuyển khoản" className="mx-auto aspect-square w-full object-contain" onError={() => setImageError("VietQR chưa tạo được ảnh từ thông tin này. Hãy kiểm tra lại ngân hàng và số tài khoản.")} />
                    {template !== "qr_only" && (selectedBank || accountName || amount || content) && (
                      <div className="mt-3 border-t border-border/70 pt-3 text-left text-xs text-text-secondary">
                        <p className="flex items-center gap-1.5 font-semibold text-text-primary"><Building2 className="h-3.5 w-3.5 text-brand-700" /> {selectedBank?.shortName || effectiveBankCode}</p>
                        {accountName && <p className="mt-1">{accountName}</p>}
                        <p className="mt-1 font-mono">{accountNumber}</p>
                        {amount && <p className="mt-1 font-semibold text-brand-700">{Number(amount).toLocaleString("vi-VN")} ₫</p>}
                        {content && <p className="mt-1 break-words">{content}</p>}
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-text-primary">VietQR đã được tạo</p>
                  {imageError && <p role="alert" className="mt-2 text-xs text-red-700">{imageError}</p>}
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => void handleDownload()} className="gap-2"><Download className="h-4 w-4" /> Tải ảnh QR</Button>
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-2 rounded-btn border border-border bg-white px-3.5 text-sm font-medium text-text-primary hover:bg-slate-50"><ExternalLink className="h-4 w-4" /> Mở ảnh gốc</a>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Landmark className="h-8 w-8" /></span>
                  <h2 className="mt-4 font-semibold text-text-primary">Mã VietQR hiển thị ở đây</h2>
                  <p className="mt-1 max-w-xs text-sm leading-6 text-text-secondary">Nhập thông tin tài khoản nhận tiền rồi tạo mã.</p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-950">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Thông tin ngân hàng, tài khoản và nội dung được gửi tới dịch vụ ảnh VietQR qua Quick Link để tạo mã. Không nhập thông tin đăng nhập, mã OTP hoặc dữ liệu bí mật.</p>
          </div>
          <p className="px-1 text-xs text-text-muted">Mã ngân hàng: {selectedBank ? `${selectedBank.code} · BIN ${selectedBank.bin}` : effectiveBankCode || "chưa chọn"}</p>
        </div>
      </div>
    </UtilityAppFrame>
  );
}
