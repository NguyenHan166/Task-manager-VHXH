import { useState, useEffect } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import {
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  UserAvatar,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import { CheckCircle2, Edit2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export function ProfilePage() {
  const { currentUser, isManager, users, switchUser, refreshSession } = useSession();
  const { showToast } = useToast();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
  const [jobTitle, setJobTitle] = useState(currentUser?.jobTitle || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditOpen && !isSaving) {
        setIsEditOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditOpen, isSaving]);

  const handleOpenEdit = () => {
    setDisplayName(currentUser?.displayName || "");
    setJobTitle(currentUser?.jobTitle || "");
    setError("");
    setIsEditOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!displayName.trim()) {
      setError("Họ và tên không được để trống");
      return;
    }

    setIsSaving(true);
    try {
      await mockRepository.updateUser(
        currentUser.id,
        {
          displayName: displayName.trim(),
          jobTitle: jobTitle.trim(),
        },
        currentUser.id
      );
      showToast("Cập nhật thông tin hồ sơ thành công", "success");
      setIsEditOpen(false);
      await refreshSession();
    } catch (err: any) {
      setError(err.message || "Lỗi khi cập nhật hồ sơ");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        <Breadcrumb items={[{ label: "Hồ sơ cá nhân" }]} />

        <PageHeader
          title="Hồ sơ tài khoản"
          subtitle="Thông tin tài khoản, chức danh công việc và phân quyền trong hệ thống."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEdit}
              className="gap-1.5 shadow-2xs font-medium"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Sửa hồ sơ
            </Button>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Avatar & Summary Card */}
          <Card className="text-center p-6 space-y-4">
            <div className="flex justify-center">
              <UserAvatar user={currentUser} size="lg" className="w-20 h-20 text-xl" showRoleBadge />
            </div>
            <div>
              <h3 className="font-bold text-lg text-text-primary">
                {currentUser?.displayName}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">{currentUser?.jobTitle}</p>
              <div className="mt-2.5">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                    isManager
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}
                >
                  {isManager ? "Trưởng phòng (MANAGER)" : "Chuyên viên (STAFF)"}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-border text-xs text-text-muted space-y-1">
              <div>Tên đăng nhập: <code className="font-mono text-brand-700">{currentUser?.username}</code></div>
              <div>Trạng thái: <span className="text-emerald-700 font-semibold">Đang hoạt động</span></div>
              <div>Ngày tạo tài khoản: {formatDateTimeVN(currentUser?.createdAt)}</div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenEdit}
                className="w-full gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Chỉnh sửa thông tin
              </Button>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="w-full text-xs text-text-muted">
                  Chọn tài khoản khác
                </Button>
              </Link>
            </div>
          </Card>

          {/* Permissions & Details */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quyền hạn & Phạm vi xử lý</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed">
                {isManager ? (
                  <ul className="space-y-2 text-text-secondary">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Quản trị & Giao việc:</strong> Có quyền tạo và phát hành công việc Chính thức (OFFICIAL) cho tất cả chuyên viên trong phòng.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Phê duyệt kết quả:</strong> Xem xét các báo cáo kết quả nộp, duyệt hoàn thành công việc hoặc trả lại yêu cầu bổ sung.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Phê duyệt đề nghị:</strong> Phê duyệt yêu cầu gia hạn thời hạn hoặc chuyển đổi người chủ trì.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Xem báo cáo KPI:</strong> Xem báo cáo điều hành toàn diện của đơn vị với số liệu thống kê chuẩn và xuất tệp CSV.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Quản trị nhân sự:</strong> Thêm tài khoản thành viên mới, phân quyền và khóa/mở khóa tài khoản chuyên viên.</span>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-2 text-text-secondary">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span><strong>Thực hiện công việc:</strong> Cập nhật tiến độ, báo cáo vướng mắc và nộp báo cáo kết quả nhiệm vụ được giao.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span><strong>Tạo việc nhóm & cá nhân:</strong> Tạo việc cộng tác nhóm (TEAM) hoặc việc riêng tư (PERSONAL). Không thể tạo việc Chính thức (OFFICIAL).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span><strong>Đề nghị gia hạn:</strong> Gửi yêu cầu xin gia hạn nộp hoặc xin đổi người chủ trì lên Trưởng phòng khi cần.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span><strong>Xem thống kê cá nhân:</strong> Xem khối lượng công việc và tỷ lệ hoàn thành đúng hạn của chính mình.</span>
                    </li>
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Quick Switch Accounts List */}
            <Card>
              <CardHeader>
                <CardTitle>Chuyển đổi nhanh tài khoản demo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {users.map((u) => {
                    const isSelected = u.id === currentUser?.id;
                    const isLocked = u.status !== "ACTIVE";
                    return (
                      <button
                        key={u.id}
                        disabled={isLocked}
                        onClick={() => !isLocked && switchUser(u.id)}
                        className={`p-2.5 rounded-btn border text-left flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-brand-50 border-brand-700 text-brand-800 font-semibold"
                            : isLocked
                            ? "bg-slate-50 border-border opacity-50 cursor-not-allowed text-text-muted"
                            : "bg-surface border-border hover:bg-slate-50 text-text-primary"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <UserAvatar user={u} size="sm" />
                          <div>
                            <div className="flex items-center gap-1">
                              <span>{u.displayName}</span>
                              {isLocked && (
                                <span className="text-[10px] text-danger font-normal">(Đã khóa)</span>
                              )}
                            </div>
                            <div className="text-[10px] text-text-muted">{u.jobTitle}</div>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] bg-brand-700 text-white px-2 py-0.5 rounded-full font-medium">
                            Đang dùng
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Modal Chỉnh sửa hồ sơ cá nhân */}
        {isEditOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-profile-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-brand-700" />
                  <h3 id="modal-edit-profile-title" className="font-bold text-base text-text-primary">
                    Chỉnh sửa hồ sơ cá nhân
                  </h3>
                </div>
                <button
                  onClick={() => setIsEditOpen(false)}
                  aria-label="Đóng"
                  className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:ring-2 focus:ring-brand-700"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Tên đăng nhập (Bất biến)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser?.username}
                    className="w-full h-9 px-3 rounded-btn bg-slate-50 border border-border text-xs font-mono text-text-muted cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Họ và tên hiển thị <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Chức danh công việc
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isSaving}
                  >
                    Lưu thông tin
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
