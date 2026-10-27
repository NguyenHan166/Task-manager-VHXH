import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../auth/SessionContext";
import { mockRepository } from "../../mocks/mock-repository";
import type { User, UserRole, UserStatus, Task, TaskParticipant } from "../../shared/data-contract";
import { getUserWorkloadStats } from "../tasks/task-selectors";
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
  StatCard,
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
  KeyRound,
  Mail,
  Phone,
  Building2,
  Users,
  Eye,
  Copy,
  Check,
  Briefcase,
  ExternalLink,
  Sparkles,
  Clock,
} from "lucide-react";

export function MembersPage() {
  const { users, currentUser, refreshSession } = useSession();
  const { showToast } = useToast();

  // Tasks & Participants state for workload analytics in Detail modal
  const [tasks, setTasks] = useState<Task[]>([]);
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterDepartment, setFilterDepartment] = useState<string>("ALL");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createEmail, setCreateEmail] = useState(""); // Email công vụ là tên đăng nhập bắt buộc
  const [createJobTitle, setCreateJobTitle] = useState("");
  const [createDepartment, setCreateDepartment] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("STAFF");
  const [createInitialPassword, setCreateInitialPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Created Success Modal (to show generated credentials)
  const [createdSuccessInfo, setCreatedSuccessInfo] = useState<{
    displayName: string;
    email: string;
    password: string;
  } | null>(null);

  // Edit Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("STAFF");
  const [editError, setEditError] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Reset Password Modal state
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Detail Modal state (Profile & Workload)
  const [detailUser, setDetailUser] = useState<User | null>(null);

  // Lock / Unlock Confirmation Dialog state
  const [userToToggleLock, setUserToToggleLock] = useState<User | null>(null);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  // Load tasks & participants for detail modal analytics
  const loadWorkloadData = async () => {
    try {
      const [tList, pList] = await Promise.all([
        mockRepository.getTasks(),
        mockRepository.getParticipants(),
      ]);
      setTasks(tList);
      setParticipants(pList);
    } catch {
      // Ignored silently
    }
  };

  useEffect(() => {
    loadWorkloadData();
    const unsub = mockRepository.subscribe(loadWorkloadData);
    return unsub;
  }, []);

  // Compute workload stats map for Detail Modal
  const workloadStatsMap = useMemo(() => {
    const list = getUserWorkloadStats(tasks, users, participants);
    const map = new Map<string, (typeof list)[0]>();
    list.forEach((st) => {
      map.set(st.user.id, st);
    });
    return map;
  }, [tasks, users, participants]);

  // Active Managers count to prevent locking or demoting the last active manager
  const activeManagersCount = useMemo(() => {
    return users.filter((u) => u.role === "MANAGER" && u.status === "ACTIVE").length;
  }, [users]);

  // Overall Statistics for top StatCards
  const statsOverview = useMemo(() => {
    const totalUsers = users.length;
    const activeCount = users.filter((u) => u.status === "ACTIVE").length;
    const lockedCount = users.filter((u) => u.status === "LOCKED").length;
    const managerCount = users.filter((u) => u.role === "MANAGER").length;
    const deputyCount = users.filter((u) => u.role === "DEPUTY_MANAGER").length;
    const staffCount = users.filter((u) => u.role === "STAFF").length;

    // Average on-time rate
    const workloadList = Array.from(workloadStatsMap.values());
    const ratedUsers = workloadList.filter((w) => w.doneCount > 0);
    const avgOnTime =
      ratedUsers.length > 0
        ? Math.round(
            ratedUsers.reduce((sum, item) => sum + item.onTimeRate, 0) / ratedUsers.length
          )
        : 100;

    return {
      totalUsers,
      activeCount,
      lockedCount,
      managerCount,
      deputyCount,
      staffCount,
      avgOnTime,
    };
  }, [users, workloadStatsMap]);

  // Unique departments for filter dropdown
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.department) set.add(u.department);
    });
    return Array.from(set).sort();
  }, [users]);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isCreateOpen && !isCreating) setIsCreateOpen(false);
        if (editingUser && !isEditing) setEditingUser(null);
        if (resetPasswordUser && !isResettingPassword) setResetPasswordUser(null);
        if (detailUser) setDetailUser(null);
        if (createdSuccessInfo) setCreatedSuccessInfo(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isCreateOpen,
    isCreating,
    editingUser,
    isEditing,
    resetPasswordUser,
    isResettingPassword,
    detailUser,
    createdSuccessInfo,
  ]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRole !== "ALL" && u.role !== filterRole) return false;
      if (filterStatus !== "ALL" && u.status !== filterStatus) return false;
      if (filterDepartment !== "ALL" && (u.department || "") !== filterDepartment) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.displayName.toLowerCase().includes(q);
        const matchEmail = (u.email || u.username || "").toLowerCase().includes(q);
        const matchJob = u.jobTitle.toLowerCase().includes(q);
        const matchDept = (u.department || "").toLowerCase().includes(q);
        const matchPhone = (u.phoneNumber || "").toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchJob && !matchDept && !matchPhone) {
          return false;
        }
      }

      return true;
    });
  }, [users, filterRole, filterStatus, filterDepartment, searchQuery]);

  // Handle Open Create
  const handleOpenCreate = () => {
    setCreateDisplayName("");
    setCreateEmail("");
    setCreateJobTitle("");
    setCreateDepartment("Tổ Tổng hợp - Kế hoạch");
    setCreatePhone("");
    setCreateRole("STAFF");
    setCreateInitialPassword(`Ows@${Math.floor(100000 + Math.random() * 900000)}`);
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

    const cleanEmail = createEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setCreateError("Vui lòng nhập email công vụ làm tên đăng nhập");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setCreateError("Tên đăng nhập phải là một địa chỉ email hợp lệ (ví dụ: canbo@agency.gov.vn)");
      return;
    }

    if (users.some((u) => u.email?.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanEmail)) {
      setCreateError("Tên đăng nhập (Email) này đã tồn tại trong hệ thống");
      return;
    }

    setIsCreating(true);
    setCreateError("");
    try {
      const created = await mockRepository.createUser(
        {
          displayName: createDisplayName.trim(),
          email: cleanEmail,
          username: cleanEmail,
          jobTitle: createJobTitle.trim() || "Chuyên viên nghiệp vụ",
          department: createDepartment.trim() || "Phòng Nghiệp vụ",
          phoneNumber: createPhone.trim() || undefined,
          role: createRole,
          initialPassword: createInitialPassword.trim(),
        },
        currentUser.id
      );

      setIsCreateOpen(false);
      setCreatedSuccessInfo({
        displayName: created.displayName,
        email: created.email,
        password: created.temporaryPassword || createInitialPassword.trim(),
      });
      showToast(`Đã thêm thành viên mới: ${createDisplayName.trim()}`, "success");
      await refreshSession();
    } catch (err: any) {
      setCreateError(err.message || "Lỗi khi tạo thành viên mới");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Open Edit
  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setEditDisplayName(user.displayName);
    setEditEmail(user.email || user.username);
    setEditJobTitle(user.jobTitle);
    setEditDepartment(user.department || "");
    setEditPhone(user.phoneNumber || "");
    setEditRole(user.role);
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

    const cleanEmail = editEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setEditError("Tên đăng nhập (Email) không được để trống");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setEditError("Tên đăng nhập phải là một địa chỉ email hợp lệ");
      return;
    }

    if (
      users.some(
        (u) =>
          u.id !== editingUser.id &&
          (u.email?.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanEmail)
      )
    ) {
      setEditError("Email này đã được sử dụng bởi một tài khoản khác trong hệ thống");
      return;
    }

    // Safety rule: Cannot demote the last active manager
    if (editingUser.role === "MANAGER" && editRole !== "MANAGER" && activeManagersCount <= 1) {
      setEditError("Không thể thay đổi vai trò vì đây là Trưởng phòng (Admin) hoạt động duy nhất của hệ thống");
      return;
    }

    setIsEditing(true);
    setEditError("");
    try {
      await mockRepository.updateUser(
        editingUser.id,
        {
          displayName: editDisplayName.trim(),
          email: cleanEmail,
          username: cleanEmail,
          jobTitle: editJobTitle.trim(),
          department: editDepartment.trim(),
          phoneNumber: editPhone.trim(),
          role: editRole,
        },
        currentUser.id
      );
      showToast(`Đã cập nhật hồ sơ & vai trò cho ${editDisplayName.trim()}`, "success");
      setEditingUser(null);
      await refreshSession();
    } catch (err: any) {
      setEditError(err.message || "Lỗi khi cập nhật hồ sơ");
    } finally {
      setIsEditing(false);
    }
  };

  // Handle Open Reset Password Modal
  const handleOpenResetPassword = (user: User) => {
    setResetPasswordUser(user);
    const autoTempPass = `Ows@${Math.floor(100000 + Math.random() * 900000)}`;
    setNewPasswordInput(autoTempPass);
    setResetPasswordError("");
    setResetPasswordSuccess(null);
    setCopiedKey(false);
  };

  // Submit Reset Password
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !currentUser) return;

    if (!newPasswordInput.trim()) {
      setResetPasswordError("Mật khẩu không được để trống");
      return;
    }

    setIsResettingPassword(true);
    setResetPasswordError("");
    try {
      const res = await mockRepository.resetPassword(
        resetPasswordUser.id,
        newPasswordInput.trim(),
        currentUser.id
      );
      setResetPasswordSuccess(res.temporaryPassword);
      showToast(`Đã đặt lại mật khẩu cho tài khoản ${resetPasswordUser.displayName}`, "success");
      await refreshSession();
    } catch (err: any) {
      setResetPasswordError(err.message || "Lỗi khi đặt lại mật khẩu");
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Copy password to clipboard
  const handleCopyPassword = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    showToast("Đã sao chép mật khẩu vào bộ nhớ tạm", "info");
    setTimeout(() => setCopiedKey(false), 2000);
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

  // Render role badge helper
  const renderRoleBadge = (role: UserRole) => {
    switch (role) {
      case "MANAGER":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Shield className="w-3 h-3 text-emerald-600" /> Trưởng phòng (Admin)
          </span>
        );
      case "DEPUTY_MANAGER":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <Shield className="w-3 h-3 text-indigo-600" /> Phó phòng (Điều hành)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <UserCheck className="w-3 h-3 text-blue-600" /> Chuyên viên
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Quản trị hệ thống", href: "/settings" }, { label: "Thành viên" }]} />

        <PageHeader
          title="Quản lý thành viên & tài khoản hệ thống"
          subtitle="Quản lý thông tin hồ sơ nhân sự, tên đăng nhập bằng email công vụ, phân vai trò điều hành & quản trị, đặt lại mật khẩu và kiểm soát trạng thái hoạt động."
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

        {/* 4 Overview Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Tổng số thành viên"
            value={statsOverview.totalUsers}
            variant="brand"
            icon={<Users className="w-5 h-5 text-brand-700" />}
            description={`${statsOverview.activeCount} đang hoạt động • ${statsOverview.lockedCount} bị khóa`}
          />

          <StatCard
            label="Lãnh đạo đơn vị"
            value={statsOverview.managerCount + statsOverview.deputyCount}
            variant="review"
            icon={<Shield className="w-5 h-5 text-indigo-700" />}
            description={`${statsOverview.managerCount} Trưởng phòng (QT) • ${statsOverview.deputyCount} Phó phòng`}
          />

          <StatCard
            label="Chuyên viên nghiệp vụ"
            value={statsOverview.staffCount}
            variant="info"
            icon={<UserCheck className="w-5 h-5 text-blue-700" />}
            description="Thực hiện & Báo cáo công việc"
          />

          <StatCard
            label="Hiệu suất hoàn thành"
            value={`${statsOverview.avgOnTime}%`}
            variant="success"
            icon={<Briefcase className="w-5 h-5 text-emerald-700" />}
            description="Tỷ lệ hoàn thành đúng hạn toàn phòng"
          />
        </div>

        {/* Filter Card */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Tìm kiếm nhân sự
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tên, email đăng nhập, chức danh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                />
              </div>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Tổ / Bộ phận
              </label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
              >
                <option value="ALL">Tất cả tổ / bộ phận</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
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
                <option value="MANAGER">Trưởng phòng (MANAGER - Admin)</option>
                <option value="DEPUTY_MANAGER">Phó phòng (DEPUTY_MANAGER - Điều hành)</option>
                <option value="STAFF">Chuyên viên (STAFF - Thực hiện)</option>
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
                  Danh sách tài khoản nhân sự ({filteredUsers.length} tài khoản)
                </CardTitle>
                <CardDescription className="text-xs">
                  Tên đăng nhập hệ thống đồng bộ trực tiếp với Email công vụ của mỗi thành viên.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Shield className="w-4 h-4 text-emerald-700" />
                <span>Trưởng phòng hoạt động: <strong>{activeManagersCount}</strong></span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Desktop Table View (>= 768px) - Cleaned: Workload column removed */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-border text-text-secondary font-semibold">
                    <th className="py-2.5 px-3">Thành viên & Chức danh</th>
                    <th className="py-2.5 px-3">Tên đăng nhập (Email)</th>
                    <th className="py-2.5 px-3">Tổ / Bộ phận</th>
                    <th className="py-2.5 px-3 text-center">Vai trò</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác quản trị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-muted">
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
                              <UserAvatar user={u} size="md" showRoleBadge />
                              <div>
                                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                                  <span>{u.displayName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200">
                                      Bạn
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                  {u.jobTitle}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div>
                              <code className="font-mono text-brand-700 font-semibold text-xs">{u.email}</code>
                              {u.phoneNumber && (
                                <div className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5">
                                  <Phone className="w-3 h-3" /> {u.phoneNumber}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                              <Building2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              <span>{u.department || "Phòng Nghiệp vụ"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {renderRoleBadge(u.role)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {statusBadge}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDetailUser(u)}
                                className="h-7 px-2 text-[11px] gap-1 text-slate-700 hover:bg-slate-100"
                                title="Xem hồ sơ chi tiết"
                              >
                                <Eye className="w-3 h-3" />
                                Xem
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEdit(u)}
                                className="h-7 px-2 text-[11px] gap-1 text-brand-700 hover:bg-brand-50 hover:border-brand-300"
                                title="Sửa thông tin hồ sơ & vai trò hệ thống"
                              >
                                <Edit2 className="w-3 h-3" />
                                Sửa
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenResetPassword(u)}
                                className="h-7 px-2 text-[11px] gap-1 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
                                title="Đặt lại mật khẩu cho tài khoản này"
                              >
                                <KeyRound className="w-3 h-3" />
                                Mật khẩu
                              </Button>

                              {u.status === "ACTIVE" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isSelf || isLastActiveManager}
                                  onClick={() => setUserToToggleLock(u)}
                                  className={`h-7 px-2 text-[11px] gap-1 ${
                                    isSelf || isLastActiveManager
                                      ? "opacity-40 cursor-not-allowed text-text-muted"
                                      : "text-danger hover:bg-red-50 hover:border-danger"
                                  }`}
                                  title={
                                    isSelf
                                      ? "Không thể tự khóa tài khoản của chính mình"
                                      : isLastActiveManager
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
                              {u.jobTitle} • {u.department || "Phòng Nghiệp vụ"}
                            </div>
                            <div className="text-[11px] font-mono text-brand-700 truncate mt-0.5">
                              {u.email}
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

                      {/* Detail row: Role & Username/Email */}
                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                        <div className="flex items-center gap-1">
                          <span className="text-text-muted text-[11px]">Vai trò:</span>
                          {renderRoleBadge(u.role)}
                        </div>

                        {u.phoneNumber && (
                          <div className="text-[11px] text-text-muted flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {u.phoneNumber}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-border/70">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailUser(u)}
                          className="w-full text-[11px] h-8 px-1"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Xem
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          className="w-full text-[11px] h-8 px-1 text-brand-700"
                          title="Sửa hồ sơ & vai trò"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Sửa
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenResetPassword(u)}
                          className="w-full text-[11px] h-8 px-1 text-amber-700"
                          title="Đặt lại mật khẩu"
                        >
                          <KeyRound className="w-3 h-3 mr-1" />
                          M.khẩu
                        </Button>

                        {u.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSelf || isLastActiveManager}
                            onClick={() => setUserToToggleLock(u)}
                            className={`w-full text-[11px] h-8 px-1 ${
                              isSelf || isLastActiveManager
                                ? "opacity-40 cursor-not-allowed"
                                : "text-danger"
                            }`}
                          >
                            <Lock className="w-3 h-3 mr-1" />
                            Khóa
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUserToToggleLock(u)}
                            className="w-full text-[11px] h-8 px-1 text-emerald-700"
                          >
                            <Unlock className="w-3 h-3 mr-1" />
                            Mở
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

        {/* Modal 1: Thêm thành viên mới (Tên đăng nhập là Email bắt buộc) */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-create-member-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
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

              <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
                {/* Tên đăng nhập là Email bắt buộc */}
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Tên đăng nhập (Email công vụ) <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder="Ví dụ: lan.ht@agency.gov.vn"
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Địa chỉ email này dùng làm tên đăng nhập chính thức của tài khoản
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      Số điện thoại / Máy lẻ nội bộ
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: 0912.345.678"
                      value={createPhone}
                      onChange={(e) => setCreatePhone(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Tổ / Bộ phận chuyên môn
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Tổ Tổng hợp - Kế hoạch"
                      value={createDepartment}
                      onChange={(e) => setCreateDepartment(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Chức danh công việc
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Chuyên viên Tổng hợp"
                      value={createJobTitle}
                      onChange={(e) => setCreateJobTitle(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block font-semibold text-text-secondary mb-1.5">
                    Vai trò hệ thống <span className="text-danger">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="createRole"
                        value="STAFF"
                        checked={createRole === "STAFF"}
                        onChange={() => setCreateRole("STAFF")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-semibold text-text-primary">Chuyên viên (STAFF)</div>
                        <div className="text-[11px] text-text-secondary">
                          Thực hiện nhiệm vụ được giao, nộp báo cáo kết quả, tạo việc nhóm và việc cá nhân.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="createRole"
                        value="DEPUTY_MANAGER"
                        checked={createRole === "DEPUTY_MANAGER"}
                        onChange={() => setCreateRole("DEPUTY_MANAGER")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-semibold text-indigo-900">Phó phòng (DEPUTY_MANAGER)</div>
                        <div className="text-[11px] text-text-secondary">
                          Toàn quyền điều hành chuyên môn: giao việc chính thức, phê duyệt kết quả, xem báo cáo toàn phòng. <strong>Không có quyền quản trị hệ thống</strong>.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="createRole"
                        value="MANAGER"
                        checked={createRole === "MANAGER"}
                        onChange={() => setCreateRole("MANAGER")}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-semibold text-emerald-900">Trưởng phòng (MANAGER)</div>
                        <div className="text-[11px] text-text-secondary">
                          Toàn quyền điều hành chuyên môn và <strong>Quản trị hệ thống</strong> (quản lý thành viên, cài đặt, nhật ký kiểm toán, sao lưu dữ liệu).
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Initial Password */}
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Mật khẩu khởi tạo ban đầu
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={createInitialPassword}
                      onChange={(e) => setCreateInitialPassword(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCreateInitialPassword(`Ows@${Math.floor(100000 + Math.random() * 900000)}`)
                      }
                      className="whitespace-nowrap text-xs h-9 px-3"
                    >
                      Sinh tự động
                    </Button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Mật khẩu tạm thời sẽ được cấp cho thành viên để đăng nhập lần đầu.
                  </p>
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

        {/* Modal 2: Thông báo Tạo thành viên thành công kèm Mật khẩu */}
        {createdSuccessInfo && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 border-b border-border pb-3">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-bold text-base text-text-primary">
                  Tạo tài khoản thành công!
                </h3>
              </div>

              <p className="text-xs text-text-secondary">
                Tài khoản cho <strong>{createdSuccessInfo.displayName}</strong> đã được khởi tạo. Vui lòng gửi thông tin đăng nhập sau đây cho thành viên:
              </p>

              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Tên đăng nhập (Email):</span>
                  <span className="font-mono font-bold text-brand-700">{createdSuccessInfo.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Mật khẩu ban đầu:</span>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {createdSuccessInfo.password}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopyPassword(
                      `Tài khoản (Email): ${createdSuccessInfo.email} | Mật khẩu: ${createdSuccessInfo.password}`
                    )
                  }
                  className="gap-1.5 text-xs"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey ? "Đã sao chép!" : "Sao chép thông tin"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreatedSuccessInfo(null)}
                >
                  Hoàn tất
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 3: Chỉnh sửa thông tin & Phân vai trò */}
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-edit-member-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
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

              <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
                {/* Email / Username field */}
                <div>
                  <label className="block font-semibold text-text-secondary mb-1">
                    Tên đăng nhập (Email công vụ) <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Email dùng làm tên đăng nhập của thành viên vào hệ thống
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      Số điện thoại / Máy lẻ nội bộ
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Tổ / Bộ phận chuyên môn
                    </label>
                    <input
                      type="text"
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
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
                </div>

                {/* Role Modification */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-text-primary text-xs">
                      Phân quyền vai trò hệ thống
                    </label>
                    {editingUser.role === "MANAGER" && activeManagersCount <= 1 && (
                      <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Trưởng phòng duy nhất (Không thể hạ vai trò)
                      </span>
                    )}
                  </div>

                  <select
                    value={editRole}
                    disabled={editingUser.role === "MANAGER" && activeManagersCount <= 1}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full h-9 px-2.5 rounded-btn bg-surface border border-border text-xs focus:ring-2 focus:ring-brand-700 outline-none"
                  >
                    <option value="STAFF">Chuyên viên (STAFF) - Thực hiện & Báo cáo</option>
                    <option value="DEPUTY_MANAGER">Phó phòng (DEPUTY_MANAGER) - Điều hành & Phê duyệt</option>
                    <option value="MANAGER">Trưởng phòng (MANAGER) - Toàn quyền Điều hành & Quản trị</option>
                  </select>

                  <p className="text-[11px] text-text-muted">
                    {editRole === "MANAGER"
                      ? "Có quyền truy cập toàn bộ hệ thống, quản lý nhân sự, cấu hình và nhật ký kiểm toán."
                      : editRole === "DEPUTY_MANAGER"
                      ? "Có toàn quyền giao việc, duyệt kết quả và xem báo cáo phòng, nhưng không được vào màn hình Thành viên và Cài đặt."
                      : "Chỉ thực hiện các công việc được phân công, phối hợp hoặc việc cá nhân/nhóm tự tạo."}
                  </p>
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

        {/* Modal 4: Đặt lại mật khẩu */}
        {resetPasswordUser && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-reset-password-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-md w-full p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <KeyRound className="w-5 h-5" />
                  <h3 id="modal-reset-password-title" className="font-bold text-base text-text-primary">
                    Đặt lại mật khẩu
                  </h3>
                </div>
                <button
                  onClick={() => setResetPasswordUser(null)}
                  aria-label="Đóng"
                  className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:ring-2 focus:ring-brand-700"
                >
                  ✕
                </button>
              </div>

              {resetPasswordError && (
                <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-danger font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {resetPasswordError}
                </div>
              )}

              {resetPasswordSuccess ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 space-y-2">
                    <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Đã đặt lại mật khẩu thành công!
                    </div>
                    <div className="text-text-secondary text-[11px]">
                      Mật khẩu mới cho tài khoản <strong>{resetPasswordUser.displayName}</strong> ({resetPasswordUser.email}):
                    </div>
                    <div className="flex items-center justify-between bg-surface p-2 rounded border border-emerald-200">
                      <code className="font-mono font-bold text-sm text-emerald-800">
                        {resetPasswordSuccess}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyPassword(resetPasswordSuccess)}
                        className="h-7 px-2 text-[11px] gap-1"
                      >
                        {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedKey ? "Đã chép" : "Sao chép"}
                      </Button>
                    </div>
                  </div>

                  <p className="text-[11px] text-text-muted">
                    Hệ thống đã tự động gửi chuông thông báo đến tài khoản này. Bạn cũng có thể gửi trực tiếp mật khẩu trên cho thành viên.
                  </p>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setResetPasswordUser(null)}
                    >
                      Đóng
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConfirmResetPassword} className="space-y-3.5 text-xs">
                  <p className="text-text-secondary">
                    Đặt lại mật khẩu cho tài khoản <strong>{resetPasswordUser.displayName}</strong> (<code className="font-mono text-brand-700">{resetPasswordUser.email}</code>). Mật khẩu cũ sẽ bị hủy hiệu lực ngay lập tức.
                  </p>

                  <div>
                    <label className="block font-semibold text-text-secondary mb-1">
                      Mật khẩu tạm thời mới <span className="text-danger">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="w-full h-9 px-3 rounded-btn bg-surface border border-border text-xs font-mono focus:ring-2 focus:ring-brand-700 outline-none"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const autoPass = `Ows@${Math.floor(100000 + Math.random() * 900000)}`;
                          setNewPasswordInput(autoPass);
                        }}
                        className="whitespace-nowrap text-xs h-9 px-3"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
                        Sinh mã
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResetPasswordUser(null)}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isResettingPassword}
                      className="bg-amber-700 hover:bg-amber-800 border-amber-700"
                    >
                      Xác nhận đặt lại
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Modal 5: Xem chi tiết hồ sơ & Tải công việc */}
        {detailUser && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-detail-member-title"
              className="bg-surface rounded-card border border-border shadow-xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <UserAvatar user={detailUser} size="md" showRoleBadge />
                  <div>
                    <h3 id="modal-detail-member-title" className="font-bold text-base text-text-primary">
                      {detailUser.displayName}
                    </h3>
                    <div className="text-xs text-text-secondary flex items-center gap-2">
                      <code className="font-mono text-brand-700">{detailUser.email}</code>
                      <span>•</span>
                      <span>{detailUser.jobTitle}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setDetailUser(null)}
                  aria-label="Đóng"
                  className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors focus:ring-2 focus:ring-brand-700"
                >
                  ✕
                </button>
              </div>

              {/* Contact and Department info */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-text-muted block text-[11px]">Tổ / Bộ phận:</span>
                  <span className="font-semibold text-text-primary">
                    {detailUser.department || "Phòng Nghiệp vụ"}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">Vai trò:</span>
                  <div className="mt-0.5">{renderRoleBadge(detailUser.role)}</div>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">Tên đăng nhập (Email):</span>
                  <span className="font-semibold font-mono text-brand-700">{detailUser.email}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">Số điện thoại:</span>
                  <span className="font-medium text-text-primary">{detailUser.phoneNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">Ngày tham gia:</span>
                  <span className="font-medium text-text-primary">{formatDateTimeVN(detailUser.createdAt)}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[11px]">Đăng nhập gần nhất:</span>
                  <span className="font-medium text-text-primary">
                    {detailUser.lastLoginAt ? formatDateTimeVN(detailUser.lastLoginAt) : "Chưa có"}
                  </span>
                </div>
              </div>

              {/* Workload Stats Block */}
              {(() => {
                const wl = workloadStatsMap.get(detailUser.id);
                const userTasks = tasks
                  .filter((t) => t.primaryAssigneeId === detailUser.id && t.status !== "CANCELLED")
                  .slice(0, 5);

                return (
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-brand-700" />
                      Tải công việc & Hiệu suất thực hiện
                    </h4>

                    {wl ? (
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2.5 bg-blue-50/60 rounded-lg border border-blue-100">
                          <div className="text-lg font-bold text-blue-700">{wl.primaryCount}</div>
                          <div className="text-[10px] text-text-muted font-medium">Chủ trì (Active)</div>
                        </div>

                        <div className="p-2.5 bg-purple-50/60 rounded-lg border border-purple-100">
                          <div className="text-lg font-bold text-purple-700">{wl.collabCount}</div>
                          <div className="text-[10px] text-text-muted font-medium">Phối hợp</div>
                        </div>

                        <div className="p-2.5 bg-emerald-50/60 rounded-lg border border-emerald-100">
                          <div className="text-lg font-bold text-emerald-700">{wl.doneCount}</div>
                          <div className="text-[10px] text-text-muted font-medium">Đã hoàn thành</div>
                        </div>

                        <div className={`p-2.5 rounded-lg border ${
                          wl.overdueCount > 0
                            ? "bg-red-50 border-red-200 text-red-700"
                            : "bg-slate-50 border-slate-200 text-text-primary"
                        }`}>
                          <div className="text-lg font-bold">{wl.overdueCount}</div>
                          <div className="text-[10px] text-text-muted font-medium">Quá hạn</div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">Chưa có dữ liệu thống kê nhiệm vụ.</p>
                    )}

                    {/* Recent Tasks */}
                    <div>
                      <div className="text-xs font-semibold text-text-primary mb-2 flex items-center justify-between">
                        <span>Nhiệm vụ đang phụ trách ({userTasks.length})</span>
                        <Link
                          to={`/tasks?assignee=${detailUser.id}`}
                          className="text-[11px] text-brand-700 hover:underline flex items-center gap-1"
                        >
                          Xem tất cả <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>

                      {userTasks.length === 0 ? (
                        <div className="text-center py-4 bg-slate-50 rounded border border-border text-xs text-text-muted">
                          Hiện thành viên này chưa được giao nhiệm vụ nào.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {userTasks.map((t) => (
                            <Link
                              key={t.id}
                              to={`/tasks/${t.id}`}
                              className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border hover:bg-slate-50 transition-colors text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-mono text-brand-700 font-bold mr-1.5">[{t.code}]</span>
                                <span className="font-medium text-text-primary truncate">{t.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                  {t.status}
                                </span>
                                {t.dueAt && (
                                  <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                                    <Clock className="w-3 h-3" />
                                    {formatDateTimeVN(t.dueAt).split(" ")[0]}
                                  </span>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-3 flex items-center justify-between border-t border-border">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const u = detailUser;
                      setDetailUser(null);
                      handleOpenEdit(u);
                    }}
                    className="text-xs gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Sửa hồ sơ
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const u = detailUser;
                      setDetailUser(null);
                      handleOpenResetPassword(u);
                    }}
                    className="text-xs gap-1 text-amber-700"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Đặt lại mật khẩu
                  </Button>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setDetailUser(null)}
                >
                  Đóng
                </Button>
              </div>
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
              ? `Tài khoản ${userToToggleLock?.displayName} (${userToToggleLock?.email}) sẽ bị chặn đăng nhập ngay lập tức. Lịch sử công việc, tin nhắn và dữ liệu đã giao của thành viên này vẫn được lưu trữ nguyên vẹn.`
              : `Tài khoản ${userToToggleLock?.displayName} (${userToToggleLock?.email}) sẽ được kích hoạt lại và có thể đăng nhập bình thường vào hệ thống.`
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
