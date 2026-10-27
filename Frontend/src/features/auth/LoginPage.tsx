import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "./SessionContext";
import { Button, UserAvatar } from "../../components/ui";
import {
  Shield,
  User,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2,
  Lock,
  UserCheck,
} from "lucide-react";

export function LoginPage() {
  const { users, currentUser, switchUser, isLoading } = useSession();
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || "u01");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSelectAccount = (userId: string) => {
    setSelectedUserId(userId);
  };

  const handleEnterWorkspace = async () => {
    setIsSubmitting(true);
    try {
      await switchUser(selectedUserId);
      navigate("/dashboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  const managerUser = users.find((u) => u.role === "MANAGER") || users[0];
  const deputyUsers = users.filter((u) => u.role === "DEPUTY_MANAGER");
  const staffUsers = users.filter((u) => u.role === "STAFF");

  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId);
  }, [users, selectedUserId]);

  const isSelectedUserLocked = selectedUser?.status !== "ACTIVE";

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Brand Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <Layers className="w-5 h-5 text-brand-100" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-text-primary">
              Office Workspace
            </div>
            <div className="text-xs text-text-muted">
              Quản lý công việc nội bộ đơn vị
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
          <Sparkles className="w-3.5 h-3.5" /> Bản xem trước với dữ liệu mẫu
        </span>
      </header>

      {/* Main Content Card */}
      <main className="max-w-4xl w-full mx-auto my-auto py-8">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Chọn tài khoản demo để trải nghiệm
          </h1>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            Hệ thống hỗ trợ 3 vai trò: <strong>Trưởng phòng</strong> (kiêm Quản trị hệ thống), <strong>Phó phòng</strong> (toàn quyền Điều hành, không có Quản trị), và <strong>Chuyên viên</strong> (Thực hiện & Báo cáo).
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-text-muted">Đang tải danh sách tài khoản demo...</div>
        ) : (
          <div className="space-y-6">
            {/* Manager Group */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  1. Tài khoản Trưởng phòng (Điều hành & Quản trị hệ thống)
                </h2>
              </div>
              {managerUser && (
                (() => {
                  const isLocked = managerUser.status !== "ACTIVE";
                  const isSelected = selectedUserId === managerUser.id;
                  return (
                    <div
                      onClick={() => !isLocked && handleSelectAccount(managerUser.id)}
                      role="button"
                      tabIndex={0}
                      className={`p-4 rounded-card border transition-all flex items-center justify-between ${
                        isLocked
                          ? "bg-slate-50 border-border opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "bg-brand-50/70 border-brand-700 ring-2 ring-brand-700/20 shadow-md cursor-pointer"
                          : "bg-surface border-border hover:border-brand-700/40 hover:bg-slate-50 shadow-xs cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <UserAvatar user={managerUser} size="lg" showRoleBadge />
                        <div>
                          <div className="font-bold text-base text-text-primary flex items-center gap-2">
                            {managerUser.displayName}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Trưởng phòng (MANAGER)
                            </span>
                            {isLocked && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Đã khóa
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-secondary mt-0.5">
                            Tên đăng nhập: <code className="font-mono text-brand-700">{managerUser.username}</code> • Chức vụ: {managerUser.jobTitle}
                          </div>
                          <div className="text-[11px] text-text-muted mt-1">
                            Quyền hạn: Toàn quyền giao việc chính thức, duyệt kết quả, đổi hạn/chủ trì, hủy/mở lại việc + <strong>Quản trị hệ thống (Thành viên & Cài đặt)</strong>.
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 pl-3">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected && !isLocked
                              ? "border-brand-700 bg-brand-700 text-white"
                              : "border-border bg-surface"
                          }`}
                        >
                          {isSelected && !isLocked && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Deputy Manager Group */}
            {deputyUsers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="w-4 h-4 text-indigo-700" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    2. Tài khoản Phó phòng (Điều hành & Phê duyệt — Không có quyền Quản trị)
                  </h2>
                </div>
                <div className="space-y-2">
                  {deputyUsers.map((deputy) => {
                    const isLocked = deputy.status !== "ACTIVE";
                    const isSelected = selectedUserId === deputy.id;
                    return (
                      <div
                        key={deputy.id}
                        onClick={() => !isLocked && handleSelectAccount(deputy.id)}
                        role="button"
                        tabIndex={0}
                        className={`p-4 rounded-card border transition-all flex items-center justify-between ${
                          isLocked
                            ? "bg-slate-50 border-border opacity-50 cursor-not-allowed"
                            : isSelected
                            ? "bg-indigo-50/70 border-indigo-700 ring-2 ring-indigo-700/20 shadow-md cursor-pointer"
                            : "bg-surface border-border hover:border-indigo-700/40 hover:bg-slate-50 shadow-xs cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <UserAvatar user={deputy} size="lg" showRoleBadge />
                          <div>
                            <div className="font-bold text-base text-text-primary flex items-center gap-2">
                              {deputy.displayName}
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Phó phòng (DEPUTY_MANAGER)
                              </span>
                              {isLocked && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                                  <Lock className="w-3 h-3" /> Đã khóa
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-text-secondary mt-0.5">
                              Tên đăng nhập: <code className="font-mono text-indigo-700">{deputy.username}</code> • Chức vụ: {deputy.jobTitle}
                            </div>
                            <div className="text-[11px] text-text-muted mt-1">
                              Quyền hạn: Toàn quyền giao việc, duyệt kết quả nộp, đổi hạn/chủ trì, xem Dashboard & Báo cáo toàn phòng — <strong>Không có quyền quản lý thành viên và cài đặt hệ thống</strong>.
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 pl-3">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected && !isLocked
                                ? "border-indigo-700 bg-indigo-700 text-white"
                                : "border-border bg-surface"
                            }`}
                          >
                            {isSelected && !isLocked && <CheckCircle2 className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Staff Group */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  3. Tài khoản Chuyên viên (Thực hiện & Phối hợp)
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {staffUsers.map((staff) => {
                  const isSelected = selectedUserId === staff.id;
                  const isLocked = staff.status !== "ACTIVE";
                  return (
                    <div
                      key={staff.id}
                      onClick={() => !isLocked && handleSelectAccount(staff.id)}
                      role="button"
                      tabIndex={0}
                      className={`p-3.5 rounded-card border transition-all flex items-center justify-between ${
                        isLocked
                          ? "bg-slate-50 border-border opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "bg-brand-50/70 border-brand-700 ring-2 ring-brand-700/20 shadow-md cursor-pointer"
                          : "bg-surface border-border hover:border-brand-700/40 hover:bg-slate-50 shadow-xs cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar user={staff} size="md" showRoleBadge />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-text-primary truncate flex items-center gap-1.5">
                            <span className="truncate">{staff.displayName}</span>
                            {isLocked && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-200">
                                Đã khóa
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted">
                            <span className="font-mono text-brand-700">{staff.username}</span> • {staff.jobTitle}
                          </div>
                          <div className="text-[11px] text-blue-700 font-medium">
                            Chuyên viên (STAFF)
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected && !isLocked
                              ? "border-brand-700 bg-brand-700 text-white"
                              : "border-border bg-surface"
                          }`}
                        >
                          {isSelected && !isLocked && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border">
              <div className="text-xs text-text-muted flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Phiên làm việc được lưu trên trình duyệt (giữ nguyên sau khi F5 reload).
              </div>

              <Button
                variant="primary"
                size="lg"
                disabled={isSelectedUserLocked}
                isLoading={isSubmitting}
                onClick={handleEnterWorkspace}
                className="w-full sm:w-auto px-8 gap-2 shadow-md"
              >
                {isSelectedUserLocked ? "Tài khoản bị khóa" : "Vào Không gian làm việc"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-text-muted border-t border-border/60">
        Office Workspace • Ứng dụng Quản lý công việc nội bộ đơn vị • Thiết kế tương thích 1440px Desktop & 390px Mobile
      </footer>
    </div>
  );
}
