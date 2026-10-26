import { useState, useMemo, useEffect } from "react";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type { User, UserRole, UserStatus } from "../../shared/data-contract";
import { AppShell } from "../../components/layout/AppShell";
import {
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  UserAvatar,
  ConfirmDialog,
  useToast,
} from "../../components/ui";
import { formatDateTimeVN } from "../../shared/datetime";
import {
  UserPlus,
  Shield,
  UserCheck,
  Lock,
  Unlock,
  Edit2,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export function MembersPage() {
  const { users, currentUser, refreshSession } = useSession();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createJobTitle, setCreateJobTitle] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("STAFF");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Edit Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Lock / Unlock Confirmation Dialog state
  const [userToToggleLock, setUserToToggleLock] = useState<User | null>(null);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  // Active Managers count to prevent locking the last manager
  const activeManagersCount = useMemo(() => {
    return users.filter((u) => u.role === "MANAGER" && u.status === "ACTIVE").length;
  }, [users]);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCreateOpen && !isCreating) setIsCreateOpen(false);
        if (editingUser && !isEditing) setEditingUser(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCreateOpen, isCreating, editingUser, isEditing]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRole !== "ALL" && u.role !== filterRole) return false;
      if (filterStatus !== "ALL" && u.status !== filterStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.displayName.toLowerCase().includes(q);
        const matchUsername = u.username.toLowerCase().includes(q);
        const matchJob = u.jobTitle.toLowerCase().includes(q);
        if (!matchName && !matchUsername && !matchJob) return false;
      }

      return true;
    });
  }, [users, filterRole, filterStatus, searchQuery]);

  // Handle Open Create
  const handleOpenCreate = () => {
    setCreateDisplayName("");
    setCreateUsername("");
    setCreateJobTitle("");
    setCreateRole("STAFF");
    setCreateError("");
    setIsCreateOpen(true);
  };

  // Submit Create
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!createDisplayName.trim()) {
      setCreateError("Vui lòng nhập họ và tên thành viên");
      return;
    }
    if (!createUsername.trim()) {
      setCreateError("Vui lòng nhập tên đăng nhập");
      return;
    }
    const cleanUsername = createUsername.trim().toLowerCase();
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setCreateError("Tên đăng nhập chỉ bao gồm chữ thường, số, dấu chấm, gạch dưới");
      return;
    }
    if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      setCreateError("Tên đăng nhập này đã tồn tại trong hệ thống");
      return;
    }

    setIsCreating(true);
    try {
      await mockRepository.createUser(
        {
          displayName: createDisplayName.trim(),
          username: cleanUsername,
          jobTitle: createJobTitle.trim() || "Chuyên viên nghiệp vụ",
          role: createRole,
        },
        currentUser.id
      );
      showToast(`Đã thêm thành viên mới: ${createDisplayName.trim()}`, "success");
      setIsCreateOpen(false);
      await refreshSession();
    } catch (err: any) {
      setCreateError(err.message || "Lỗi khi tạo thành viên");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Open Edit
  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditDisplayName(user.displayName);
    setEditJobTitle(user.jobTitle);
    setEditError("");
  };

  // Submit Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !currentUser) return;
    if (!editDisplayName.trim()) {
      setEditError("Họ và tên không được để trống");
      return;
    }

    setIsEditing(true);
    try {
      await mockRepository.updateUser(
        editingUser.id,
        {
          displayName: editDisplayName.trim(),
          jobTitle: editJobTitle.trim(),
        },
        currentUser.id
      );
      showToast(`Đã cập nhật thông tin cho ${editDisplayName.trim()}`, "success");
      setEditingUser(null);
      await refreshSession();
    } catch (err: any) {
      setEditError(err.message || "Lỗi khi cập nhật hồ sơ");
    } finally {
      setIsEditing(false);
    }
  };

  // Toggle Lock
  const handleConfirmToggleLock = async () => {
    if (!userToToggleLock || !currentUser) return;

    const isLocking = userToToggleLock.status === "ACTIVE";
    const nextStatus: UserStatus = isLocking ? "LOCKED" : "ACTIVE";

    setIsTogglingLock(true);
    try {
      await mockRepository.updateUser(
        userToToggleLock.id,
        { status: nextStatus },
        currentUser.id
      );
      showToast(
        isLocking
          ? `Đã khóa tài khoản ${userToToggleLock.displayName}`
          : `Đã mở khóa tài khoản ${userToToggleLock.displayName}`,
        "success"
      );
      setUserToToggleLock(null);
      await refreshSession();
    } catch (err: any) {
      showToast(err.message || "Lỗi khi thay đổi trạng thái tài khoản", "error");
    } finally {
      setIsTogglingLock(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Thành viên" }]} />

        <PageHeader
          title="Quản lý thành viên phòng ban"
          subtitle="Danh sách tài khoản nhân sự, chức danh công việc, vai trò phân quyền và trạng thái hoạt động."
          actions={
            <Button
              variant="primary"
              onClick={handleOpenCreate}
              className="gap-2 shadow-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Thêm thành viên mới
            </Button>
          }
        />

        {/* Filter Card */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Search */}
            <div className="sm:col-span-2 relative">
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Tìm kiếm nhân sự
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hiển thị, username, chức danh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                />
              </div>
            </div>

            {/* Role Filter */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Vai trò hệ thống
              </label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
              >
                <option value="ALL">Tất cả vai trò</option>
                <option value="MANAGER">Trưởng phòng (MANAGER)</option>
                <option value="STAFF">Chuyên viên (STAFF)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Trạng thái tài khoản
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                <option value="LOCKED">Bị khóa (LOCKED)</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">
                  Danh sách nhân sự ({filteredUsers.length} tài khoản)
                </CardTitle>
                <CardDescription className="text-xs">
                  Tài khoản bị khóa sẽ không thể đăng nhập hoặc lựa chọn trong phiên demo, nhưng lịch sử xử lý vẫn được bảo lưu toàn vẹn.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Shield className="w-4 h-4 text-emerald-700" />
                <span>Trưởng phòng hoạt động: <strong>{activeManagersCount}</strong></span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-border text-text-secondary font-semibold">
                    <th className="py-2.5 px-3">Thành viên</th>
                    <th className="py-2.5 px-3">Tên đăng nhập</th>
                    <th className="py-2.5 px-3">Chức danh công việc</th>
                    <th className="py-2.5 px-3 text-center">Vai trò</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3">Ngày tạo</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-text-muted">
                        Không tìm thấy tài khoản nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      const isManagerUser = u.role === "MANAGER";
                      const isLastActiveManager = isManagerUser && u.status === "ACTIVE" && activeManagersCount <= 1;

                      let statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hoạt động
                        </span>
                      );
                      if (u.status === "LOCKED") {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                            <Lock className="w-3 h-3 text-red-600" /> Bị khóa
                          </span>
                        );
                      }

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <UserAvatar user={u} size="sm" showRoleBadge />
                              <div>
                                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                                  {u.displayName}
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200">
                                      Bạn
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <code className="font-mono text-brand-700 font-medium">{u.username}</code>
                          </td>
                          <td className="py-3 px-3 text-text-secondary">
                            {u.jobTitle}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isManagerUser ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <Shield className="w-3 h-3 text-emerald-600" /> Trưởng phòng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                <UserCheck className="w-3 h-3 text-blue-600" /> Chuyên viên
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {statusBadge}
                          </td>
                          <td className="py-3 px-3 text-text-muted">
                            {formatDateTimeVN(u.createdAt)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEdit(u)}
                                className="h-7 px-2 text-[11px] gap-1"
                                title="Sửa tên và chức danh"
                              >
                                <Edit2 className="w-3 h-3" />
                                Sửa
                              </Button>

                              {u.status === "ACTIVE" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isLastActiveManager}
                                  onClick={() => setUserToToggleLock(u)}
                                  className={`h-7 px-2 text-[11px] gap-1 ${
                                    isLastActiveManager
                                      ? "opacity-40 cursor-not-allowed"
                                      : "text-danger hover:bg-red-50 hover:border-danger"
                                  }`}
                                  title={
                                    isLastActiveManager
                                      ? "Không thể khóa Trưởng phòng duy nhất còn hoạt động"
                                      : "Khóa tài khoản này"
                                  }
                                >
                                  <Lock className="w-3 h-3" />
                                  Khóa
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setUserToToggleLock(u)}
                                  className="h-7 px-2 text-[11px] gap-1 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500"
                                  title="Mở khóa tài khoản"
                                >
                                  <Unlock className="w-3 h-3" />
                                  Mở khóa
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (< 768px) */}
            <div className="block md:hidden p-3 space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  Không tìm thấy tài khoản nào phù hợp với bộ lọc.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isManagerUser = u.role === "MANAGER";
                  const isLastActiveManager = isManagerUser && u.status === "ACTIVE" && activeManagersCount <= 1;

                  return (
                    <div
                      key={u.id}
                      className="p-3.5 bg-surface rounded-card border border-border shadow-xs space-y-3"
                    >
                      {/* Top: Avatar, Name, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar user={u} size="md" showRoleBadge />
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-text-primary flex items-center gap-1.5 truncate">
                              <span>{u.displayName}</span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200 shrink-0">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-text-secondary truncate mt-0.5">
                              {u.jobTitle}
                            </div>
                          </div>
                        </div>

                        {u.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 shrink-0">
                            <Lock className="w-3 h-3 text-red-600" /> Bị khóa
                          </span>
                        )}
                      </div>

                      {/* Detail row: Role & Username */}
                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                        <div className="flex items-center gap-1">
                          <span className="text-text-muted text-[11px]">Vai trò:</span>
                          {isManagerUser ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Shield className="w-2.5 h-2.5 text-emerald-600" /> Trưởng phòng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              <UserCheck className="w-2.5 h-2.5 text-blue-600" /> Chuyên viên
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-brand-700 font-medium">
                          @{u.username}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/70">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          className="w-full gap-1.5 text-xs h-8"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Sửa thông tin
                        </Button>

                        {u.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLastActiveManager}
                            onClick={() => setUserToToggleLock(u)}
                            className={`w-full gap-1.5 text-xs h-8 ${
                              isLastActiveManager
                                ? "opacity-40 cursor-not-allowed"
                                : "text-danger hover:bg-red-50 hover:border-danger"
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Khóa tài khoản
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUserToToggleLock(u)}
                            className="w-full gap-1.5 text-xs h-8 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Mở khóa
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Modal Thêm thành viên */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-create-member-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-700" />
                  <h3 id="modal-create-member-title" className="font-bold text-base text-text-primary">
                    Thêm tài khoản thành viên mới
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  aria-label="Đóng"
                  className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:ring-2 focus:ring-brand-700"
                >
                  ✕
                </button>
              </div>

              {createError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Họ và tên hiển thị <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Hoàng Thị Lan"
                    value={createDisplayName}
                    onChange={(e) => setCreateDisplayName(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Tên đăng nhập (username) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: lanht"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                  <p className="text-[10px] text-text-muted mt-0.5">Dùng để đăng nhập hoặc định danh trong hệ thống</p>
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Chức danh công việc
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Chuyên viên Hợp đồng & Pháp chế"
                    value={createJobTitle}
                    onChange={(e) => setCreateJobTitle(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Vai trò hệ thống
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as UserRole)}
                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  >
                    <option value="STAFF">Chuyên viên (STAFF) - Thực hiện công việc</option>
                    <option value="MANAGER">Trưởng phòng (MANAGER) - Quản trị & Giao việc</option>
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isCreating}
                  >
                    Tạo tài khoản
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Sửa thông tin thành viên */}
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-member-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-brand-700" />
                  <h3 id="modal-edit-member-title" className="font-bold text-base text-text-primary">
                    Chỉnh sửa hồ sơ: {editingUser.displayName}
                  </h3>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  aria-label="Đóng"
                  className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:ring-2 focus:ring-brand-700"
                >
                  ✕
                </button>
              </div>

              {editError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {editError}
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Tên đăng nhập (Bất biến)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingUser.username}
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
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Chức danh công việc
                  </label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingUser(null)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isEditing}
                  >
                    Lưu thay đổi
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Dialog Xác nhận Khóa / Mở khóa tài khoản */}
        <ConfirmDialog
          isOpen={Boolean(userToToggleLock)}
          title={
            userToToggleLock?.status === "ACTIVE"
              ? `Khóa tài khoản ${userToToggleLock?.displayName}?`
              : `Mở khóa tài khoản ${userToToggleLock?.displayName}?`
          }
          description={
            userToToggleLock?.status === "ACTIVE"
              ? "Tài khoản bị khóa sẽ không thể đăng nhập hoặc lựa chọn trong danh sách demo. Dữ liệu công việc và lịch sử đã giao vẫn được giữ nguyên vẹn."
              : "Tài khoản sẽ được kích hoạt lại và có thể đăng nhập bình thường vào hệ thống."
          }
          confirmText={userToToggleLock?.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa"}
          cancelText="Bỏ qua"
          variant={userToToggleLock?.status === "ACTIVE" ? "danger" : "primary"}
          isLoading={isTogglingLock}
          onConfirm={handleConfirmToggleLock}
          onCancel={() => setUserToToggleLock(null)}
        />
      </div>
    </AppShell>
  );
}
