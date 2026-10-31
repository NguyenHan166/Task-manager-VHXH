import { Link } from "react-router-dom";
import {
  ArrowRight,
  Files,
  LockKeyhole,
  QrCode,
  ReceiptText,
  Table2,
  Wrench,
} from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { Breadcrumb, PageHeader } from "../../components/ui";

const utilityApps = [
  {
    to: "/utilities/pdf",
    title: "PDF mini",
    description: "Gộp PDF, trích trang hoặc chuyển nhiều ảnh PNG, JPG và WebP thành PDF.",
    detail: "Gộp PDF · Tách trang · Ảnh thành PDF",
    icon: Files,
    color: "bg-rose-50 text-rose-700",
  },
  {
    to: "/utilities/data",
    title: "Xử lý Excel / CSV nhanh",
    description: "Xem trước dữ liệu, lọc nhanh, xóa dòng trùng và xuất lại bảng đã xử lý.",
    detail: "Lọc dữ liệu · Xóa trùng · Xuất tệp",
    icon: Table2,
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    to: "/utilities/qr",
    title: "Tạo mã QR",
    description: "Tạo mã QR tùy chỉnh màu, kiểu chấm, góc mã và thêm logo ở giữa.",
    detail: "Tùy chỉnh · Tải PNG / SVG",
    icon: QrCode,
    color: "bg-sky-50 text-sky-700",
  },
  {
    to: "/utilities/bank-qr",
    title: "Tạo QR ngân hàng",
    description: "Tạo mã VietQR kèm ngân hàng nhận, số tài khoản, số tiền và nội dung chuyển khoản.",
    detail: "Dùng Quick Link công khai của VietQR",
    icon: ReceiptText,
    color: "bg-violet-50 text-violet-700",
  },
];

export function UtilitiesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Tiện ích" }]} />
        <PageHeader
          title="Tiện ích"
          subtitle="Các công cụ nhỏ hỗ trợ xử lý tài liệu và dữ liệu văn phòng."
          badge={(
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <Wrench className="h-3.5 w-3.5" /> 4 mini app
            </span>
          )}
        />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2" aria-label="Danh sách mini app">
          {utilityApps.map(({ to, title, description, detail, icon: Icon, color }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-border/80 bg-white/90 p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              <div className="flex items-start gap-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${color}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-text-primary">{title}</h2>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition group-hover:translate-x-1 group-hover:text-brand-700" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
                  <p className="mt-4 text-xs font-medium text-brand-700">{detail}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-sm text-text-secondary">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
          <p className="leading-6">
            PDF, Excel / CSV và QR thông thường được xử lý ngay trong trình duyệt. QR ngân hàng dùng dịch vụ ảnh công khai của VietQR để tạo ảnh mã.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
