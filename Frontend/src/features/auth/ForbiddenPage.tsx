import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/layout/AppShell";
import { Button, Card, CardContent } from "../../components/ui";
import { ShieldAlert, ArrowLeft, Home, UserCheck } from "lucide-react";
import { useSession } from "./SessionContext";

export interface ForbiddenPageProps {
  message?: string;
  resourceName?: string;
  backUrl?: string;
}

export function ForbiddenPage({
  message = "Bạn không có quyền truy cập vào nội dung hoặc tính năng này.",
  resourceName,
  backUrl = "/dashboard",
}: ForbiddenPageProps) {
  const navigate = useNavigate();
  const { currentUser, isManager, switchUser } = useSession();

  const roleText =
    currentUser?.role === "MANAGER"
      ? "Trưởng phòng - Kiêm quản trị"
      : currentUser?.role === "DEPUTY_MANAGER"
      ? "Phó phòng - Điều hành, không quản trị"
      : "Chuyên viên";

  const roleColor =
    currentUser?.role === "MANAGER"
      ? "text-emerald-700"
      : currentUser?.role === "DEPUTY_MANAGER"
      ? "text-indigo-700"
      : "text-blue-700";

  return (
    <AppShell>
      <div className="py-12 sm:py-20 flex items-center justify-center">
        <Card className="max-w-lg w-full text-center border-red-200/80 shadow-lg">
          <CardContent className="p-8 sm:p-10 space-y-5">
            <div className="w-16 h-16 rounded-full bg-red-100 text-danger flex items-center justify-center mx-auto shadow-xs animate-bounce-subtle">
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-danger">
                Lỗi 403 — Không có quyền truy cập
              </div>
              <h2 className="text-2xl font-bold text-text-primary tracking-tight">
                Truy cập bị từ chối
              </h2>
              <p className="text-sm text-text-secondary max-w-sm mx-auto leading-relaxed">
                {message}
              </p>
              {resourceName && (
                <p className="text-xs font-mono text-text-muted mt-1">
                  Mục yêu cầu: {resourceName}
                </p>
              )}
            </div>

            <div className="p-4 rounded-card bg-slate-50 border border-border text-left text-xs space-y-2">
              <div className="font-semibold text-text-primary flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-brand-700" />
                Thông tin phiên làm việc:
              </div>
              <div className="text-text-secondary">
                Tài khoản: <strong className="text-text-primary">{currentUser?.displayName}</strong> ({currentUser?.jobTitle})
              </div>
              <div className="text-text-secondary">
                Vai trò hiện tại:{" "}
                <span className={`font-semibold ${roleColor}`}>
                  {roleText}
                </span>
              </div>
              {!isManager && (
                <p className="text-[11px] text-text-muted pt-1 border-t border-border/60">
                  Gợi ý kiểm thử: Chuyển sang tài khoản <strong>Nguyễn Văn An (Trưởng phòng)</strong> qua Dev Tools để có đầy đủ quyền Quản trị hệ thống.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => navigate(-1)}
                className="w-full sm:w-auto gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Quay lại trang trước
              </Button>
              <Link to={backUrl} className="w-full sm:w-auto">
                <Button variant="primary" size="md" className="w-full gap-2">
                  <Home className="w-4 h-4" /> Về trang Tổng quan
                </Button>
              </Link>
            </div>

            {!isManager && (
              <div className="pt-2">
                <button
                  onClick={() => switchUser("u01")}
                  className="text-xs text-brand-700 hover:text-brand-800 hover:underline font-semibold"
                >
                  ⚡ Đổi nhanh sang Trưởng phòng (u01) để thử lại
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
