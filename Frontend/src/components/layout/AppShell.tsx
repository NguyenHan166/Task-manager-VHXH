import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../features/auth/SessionContext";
import { useWorkspaceSettings } from "../../features/tasks/use-tasks";
import { UserAvatar } from "../ui/Avatar";
import { FloatingNetworkBackground } from "../ui/FloatingNetworkBackground";
import { workspaceRepository, httpRepository } from "../../shared/repository";
import { mockRepository } from "../../mocks/mock-repository";
import { setSidebarCounts, useSidebarCounts, type SidebarCountKey } from "../../shared/sidebar-counts";
import { getUnreadCount } from "../../features/tasks/task-selectors";
import { canSeeTask } from "../../shared/data-contract";
import type { Task, Notification } from "../../shared/data-contract";
import { formatRelativeVN } from "../../shared/datetime";
import { StatusBadge } from "../ui/Badge";
import { DevToolbar } from "../../features/dev/DevToolbar";
import {
  LayoutDashboard,
  CheckSquare,
  PlusCircle,
  FileCheck,
  FolderKanban,
  Calendar,
  MessageSquare,
  BarChart3,
  Users,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Shield,
  Layers,
  Palette,
  RotateCcw,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Check,
  Repeat,
  FileText,
  Wrench,
  Archive,
} from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, isManager, isDeputy, users, switchUser, logout, isMockMode } = useSession();
  const sidebarCounts = useSidebarCounts(currentUser?.id);
  const { settings } = useWorkspaceSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isMockMode || !currentUser) return;
    const updateCounts = () => {
      const snapshot = mockRepository.getSnapshot();
      const visibleTasks = snapshot.tasks.filter((task) => canSeeTask(task, currentUser, snapshot.participants));
      const visibleProjects = snapshot.projects.filter((project) =>
        isManager || isDeputy || project.ownerId === currentUser.id ||
        snapshot.tasks.some((task) => task.projectId === project.id && canSeeTask(task, currentUser, snapshot.participants))
      );
      const visibleRules = snapshot.recurrenceRules.filter((rule) =>
        !currentUser.role || currentUser.role !== "STAFF" || rule.scope === "ALL" ||
        rule.assigneeIds?.includes(currentUser.id) || rule.primaryAssigneeId === currentUser.id
      );
      const pendingApprovals = snapshot.tasks.filter((task) => task.type === "OFFICIAL" && task.status === "IN_REVIEW").length +
        snapshot.deadlineRequests.filter((request) => request.status === "PENDING").length +
        snapshot.assigneeRequests.filter((request) => request.status === "PENDING").length;

      setSidebarCounts(currentUser.id, {
        tasks: visibleTasks.length,
        approvals: pendingApprovals,
        projects: visibleProjects.length,
        recurrence: visibleRules.length,
        members: snapshot.users.length,
      });
    };

    updateCounts();
    return workspaceRepository.subscribe(updateCounts);
  }, [currentUser, isManager, isDeputy, isMockMode]);

  useEffect(() => {
    if (isMockMode || !currentUser) return;
    setSidebarCounts(currentUser.id, { members: users.length });
  }, [currentUser?.id, isMockMode, users.length]);

  // Search state & popover
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Notification dropdown
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<Notification[]>([]);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  // User menu dropdown
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Load unread count & notifications
  const updateNotifications = async () => {
    if (!currentUser) return;
    try {
      const notifs = await workspaceRepository.getNotifications(currentUser.id);
      setUnreadCount(isMockMode ? getUnreadCount(notifs, currentUser.id) : await httpRepository.getUnreadNotificationCount());
      setRecentNotifs(notifs.slice(0, 5));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    updateNotifications();
    const unsub = workspaceRepository.subscribe(updateNotifications);
    return unsub;
  }, [currentUser]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(event.target as Node)
      ) {
        setShowNotifDropdown(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Quick search handler
  useEffect(() => {
    if (!searchQuery.trim() || !currentUser) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (isMockMode) {
          const [allTasks, participants] = await Promise.all([
            workspaceRepository.getTasks(),
            workspaceRepository.getParticipants(),
          ]);
          const q = searchQuery.toLowerCase().trim();
          const matched = allTasks.filter((task) => {
            const matchText = task.code.toLowerCase().includes(q) || task.title.toLowerCase().includes(q) || task.deliverable.toLowerCase().includes(q);
            return matchText && canSeeTask(task, currentUser, participants);
          });
          setSearchResults(matched.slice(0, 6));
        } else {
          const page = await httpRepository.queryTasks({ search: searchQuery.trim(), page: 1, pageSize: 6, sortBy: "UPDATED_AT", sortDirection: "DESC" });
          setSearchResults(page.items);
        }
        setShowSearchDropdown(true);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser]);

  const handleSelectTask = (taskId: string) => {
    setShowSearchDropdown(false);
    setSearchQuery("");
    setMobileSearchOpen(false);
    navigate(`/tasks/${taskId}`);
  };

  const handleResetData = async () => {
    if (
      window.confirm(
        "Khôi phục toàn bộ kho dữ liệu mock về seed chuẩn? Các thao tác thử nghiệm sẽ được làm mới."
      )
    ) {
      if (isMockMode) await workspaceRepository.resetSeed();
      setShowUserDropdown(false);
    }
  };

  // Sidebar Menu items by Role
  // MANAGER: Tổng quan, Tất cả công việc, Giao việc, Chờ duyệt, Dự án, Lịch, Tin nhắn, Báo cáo, Thành viên, Cài đặt/Nhật ký
  const managerNavItems = [
    { label: "Tổng quan", path: "/dashboard", icon: LayoutDashboard },
    { label: "Tất cả công việc", path: "/tasks", icon: CheckSquare },
    { label: "Giao việc", path: "/tasks/create", icon: PlusCircle },
    { label: "Chờ duyệt", path: "/approvals", icon: FileCheck },
    { label: "Dự án", path: "/projects", icon: FolderKanban },
    { label: "Nhiệm vụ định kỳ", path: "/recurrence", icon: Repeat },
    { label: "Lưu trữ", path: "/tasks/archived", icon: Archive },
    { label: "Lịch", path: "/calendar", icon: Calendar },
    { label: "Tài liệu", path: "/files", icon: FileText },
    { label: "Tin nhắn", path: "/chat", icon: MessageSquare },
    { label: "Báo cáo", path: "/reports", icon: BarChart3 },
    { label: "Tiện ích", path: "/utilities", icon: Wrench },
    { label: "Thành viên", path: "/members", icon: Users },
    { label: "Cài đặt / Nhật ký", path: "/settings", icon: Settings },
  ];

  // DEPUTY: Gồm toàn bộ quyền điều hành của Trưởng phòng nhưng KHÔNG CÓ Quản trị thành viên & Cài đặt hệ thống
  const deputyNavItems = [
    { label: "Tổng quan", path: "/dashboard", icon: LayoutDashboard },
    { label: "Tất cả công việc", path: "/tasks", icon: CheckSquare },
    { label: "Giao việc", path: "/tasks/create", icon: PlusCircle },
    { label: "Chờ duyệt", path: "/approvals", icon: FileCheck },
    { label: "Dự án", path: "/projects", icon: FolderKanban },
    { label: "Nhiệm vụ định kỳ", path: "/recurrence", icon: Repeat },
    { label: "Lịch", path: "/calendar", icon: Calendar },
    { label: "Tài liệu", path: "/files", icon: FileText },
    { label: "Tin nhắn", path: "/chat", icon: MessageSquare },
    { label: "Báo cáo", path: "/reports", icon: BarChart3 },
    { label: "Tiện ích", path: "/utilities", icon: Wrench },
  ];

  // STAFF: Tổng quan của tôi, Công việc của tôi, Việc cá nhân, Dự án, Lịch của tôi, Tài liệu, Tin nhắn, Báo cáo của tôi, Thông báo, Hồ sơ
  const staffNavItems = [
    { label: "Tổng quan của tôi", path: "/dashboard", icon: LayoutDashboard },
    { label: "Công việc của tôi", path: "/tasks", icon: CheckSquare },
    { label: "Việc cá nhân", path: "/personal-tasks", icon: UserIcon },
    { label: "Nhiệm vụ định kỳ", path: "/recurrence", icon: Repeat },
    { label: "Dự án", path: "/projects", icon: FolderKanban },
    { label: "Lịch của tôi", path: "/calendar", icon: Calendar },
    { label: "Tài liệu", path: "/files", icon: FileText },
    { label: "Tin nhắn", path: "/chat", icon: MessageSquare },
    { label: "Báo cáo của tôi", path: "/reports", icon: BarChart3 },
    { label: "Tiện ích", path: "/utilities", icon: Wrench },
    { label: "Thông báo", path: "/notifications", icon: Bell },
    { label: "Hồ sơ", path: "/profile", icon: UserIcon },
  ];

  const currentNavItems = isManager ? managerNavItems : isDeputy ? deputyNavItems : staffNavItems;
  const navCountKeys: Partial<Record<string, SidebarCountKey>> = {
    "/tasks": "tasks",
    "/approvals": "approvals",
    "/projects": "projects",
    "/recurrence": "recurrence",
    "/members": "members",
  };
  const getNavCount = (path: string) => {
    const key = navCountKeys[path];
    return key ? sidebarCounts[key] : undefined;
  };
  const isP1Route = ["/personal-tasks", "/projects", "/calendar", "/recurrence", "/chat"].some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  const hasP1TaskControls = location.pathname === "/tasks" ||
    location.pathname.startsWith("/tasks/") || location.pathname === "/approvals";

  return (
    <div className="relative isolate min-h-screen flex network-background-surface text-text-primary antialiased">
      <FloatingNetworkBackground />
      {/* Desktop Sidebar (Fixed 248px) */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start flex-col w-[248px] bg-surface/78 backdrop-blur-sm border-r border-border shrink-0 z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 border-b border-border/80 gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-700 text-white flex items-center justify-center font-bold text-base shadow-sm">
            <Layers className="w-4 h-4 text-brand-100" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm tracking-tight text-text-primary truncate">
              Office Workspace
            </div>
            <div className="text-[11px] text-text-muted truncate">
              {settings?.workspaceName || "Phòng Chuyên môn"}
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="min-h-0 flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="text-sm font-semibold text-text-primary px-3 mb-2">
            {isManager ? "Quản trị & Điều hành" : isDeputy ? "Điều hành & Phê duyệt" : "Không gian Chuyên viên"}
          </div>

          {currentNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === "/utilities" && location.pathname.startsWith("/utilities/")) ||
              (item.path === "/dashboard" && location.pathname === "/");

            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-brand-700 font-semibold text-white shadow-sm"
                    : "font-medium text-text-secondary hover:bg-white/65 hover:text-text-primary"
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${isActive ? "text-white" : "text-text-muted group-hover:bg-white/80"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{item.label}</span>
                {getNavCount(item.path) !== undefined && (
                  <span className={`ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${isActive ? "bg-white/15 text-white" : "bg-slate-100 text-text-muted group-hover:bg-brand-50 group-hover:text-brand-700"}`}>
                    {getNavCount(item.path)}
                  </span>
                )}
              </Link>
            );
          })}

          {isMockMode && <div className="pt-3 border-t border-border/60 my-2">
            <Link
              to="/ui-kit"
              className={`flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                location.pathname === "/ui-kit"
                  ? "bg-brand-700 text-white font-semibold shadow-sm"
                  : "text-text-muted hover:text-brand-700 hover:bg-slate-50"
              }`}
            >
              <Palette className="w-4 h-4 text-brand-700" />
              <span>Hệ thống Design System</span>
            </Link>
          </div>}
        </nav>

        {/* Active User Card at bottom of Sidebar */}
        <div className="p-3 border-t border-border/80">
          <Link
            to="/profile"
            className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50/80 hover:bg-slate-100 border border-border/70 transition-colors"
          >
            <UserAvatar user={currentUser} size="sm" showRoleBadge />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-text-primary truncate">
                {currentUser?.displayName}
              </div>
              <div className="text-[10px] text-text-muted flex items-center gap-1">
                {isManager ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> Trưởng phòng
                  </span>
                ) : isDeputy ? (
                  <span className="text-indigo-700 font-semibold flex items-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" /> Phó phòng
                  </span>
                ) : (
                  <span>Chuyên viên</span>
                )}
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-surface/78 backdrop-blur-sm border-b border-border flex items-center justify-between px-3 sm:px-6 z-30 sticky top-0 shadow-2xs">
          {/* Left: Mobile hamburger & Global Search */}
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-2 sm:mr-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
              className="lg:hidden p-2 rounded-btn text-text-secondary hover:bg-slate-100 shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Desktop Search Input with Results Popover */}
            <div ref={searchContainerRef} className="relative hidden sm:block w-72 lg:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Tìm nhanh theo mã việc (CV-) hoặc tên..."
                className="w-full h-9 pl-9 pr-8 rounded-btn bg-slate-50 border border-border text-xs text-text-primary placeholder:text-text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Search Results Popover */}
              {showSearchDropdown && (
                <div className="absolute left-0 top-11 w-96 bg-surface border border-border rounded-card shadow-xl p-2 z-50 animate-scale-up text-xs">
                  <div className="px-2 py-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
                    <span>Kết quả tìm kiếm ({searchResults.length})</span>
                    {isSearching && <span className="text-brand-700 animate-pulse">Đang tìm...</span>}
                  </div>

                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-text-muted">
                      Không tìm thấy công việc nào phù hợp (hoặc bạn không có quyền xem).
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                      {searchResults.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => handleSelectTask(task.id)}
                          className="p-2 hover:bg-brand-50/60 rounded cursor-pointer transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono font-bold text-text-primary">
                              {task.code}
                            </span>
                            <div className="flex items-center gap-1">
                              <StatusBadge status={task.status} />
                            </div>
                          </div>
                          <div className="font-medium text-text-primary line-clamp-1">
                            {task.title}
                          </div>
                          <div className="text-[10px] text-text-muted line-clamp-1">
                            {task.deliverable}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Search Icon Toggle */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              aria-label="Mở tìm kiếm nhanh"
              className="sm:hidden p-2 text-text-secondary hover:bg-slate-100 rounded-btn"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* UI Kit Pill */}
            <Link
              to="/ui-kit"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
              UI Kit
            </Link>

            {/* Notification Bell with Dropdown */}
            <div ref={notifContainerRef} className="relative">
              <button
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                aria-label="Thông báo hệ thống"
                className="relative p-2 rounded-full text-text-secondary hover:bg-slate-100 hover:text-text-primary transition-colors"
                title="Thông báo"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {showNotifDropdown && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 bg-surface border border-border rounded-card shadow-2xl p-3 z-50 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-border/80">
                    <span className="font-bold text-text-primary">Thông báo gần đây</span>
                    <button
                      onClick={async () => {
                        if (currentUser) {
                          await workspaceRepository.markAllNotificationsAsRead(currentUser.id);
                          setUnreadCount(0);
                        }
                      }}
                      className="text-[11px] text-brand-700 hover:underline font-medium"
                    >
                      Đánh dấu tất cả đã đọc
                    </button>
                  </div>

                  <div className="divide-y divide-border/60 my-2 max-h-64 overflow-y-auto">
                    {recentNotifs.length === 0 ? (
                      <div className="p-4 text-center text-text-muted">Không có thông báo mới.</div>
                    ) : (
                      recentNotifs.map((n) => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            setShowNotifDropdown(false);
                            if (!n.readAt) {
                              await workspaceRepository.markNotificationAsRead(n.id);
                            }
                            if (n.type === "TEAM_INVITED") {
                              navigate("/notifications");
                            } else if (n.entityType === "TASK" && n.entityId) {
                              navigate(`/tasks/${n.entityId}`);
                            } else if (n.entityType === "CHAT" && isMockMode) {
                              navigate(`/chat?roomId=${n.entityId}`);
                            }
                          }}
                          className={`p-2.5 hover:bg-slate-50 rounded cursor-pointer space-y-1 transition-colors ${
                            !n.readAt ? "bg-brand-50/30" : ""
                          }`}
                        >
                          <div className="font-semibold text-text-primary line-clamp-1">
                            {n.title}
                          </div>
                          <div className="text-text-secondary text-[11px] line-clamp-2 leading-relaxed">
                            {n.body}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {formatRelativeVN(n.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/80 text-center">
                    <Link
                      to="/notifications"
                      onClick={() => setShowNotifDropdown(false)}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Xem toàn bộ thông báo →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Account Menu with Avatar */}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 p-1 sm:pl-2.5 sm:pr-2 sm:py-1 rounded-btn hover:bg-slate-100 transition-colors border border-transparent hover:border-border"
              >
                <UserAvatar user={currentUser} size="sm" showRoleBadge />
                <div className="hidden md:block text-left text-xs leading-tight">
                  <div className="font-semibold text-text-primary truncate max-w-[120px]">
                    {currentUser?.displayName}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {isManager ? "Trưởng phòng" : isDeputy ? "Phó phòng" : "Chuyên viên"}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted hidden sm:block" />
              </button>

              {/* User Account Dropdown */}
              {showUserDropdown && (
                <div className="absolute right-0 top-12 w-64 bg-surface border border-border rounded-card shadow-2xl p-2.5 z-50 text-xs">
                  {/* Current account summary */}
                  <div className="p-2 border-b border-border/70 mb-2">
                    <div className="font-bold text-text-primary text-sm">
                      {currentUser?.displayName}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {currentUser?.jobTitle} •{" "}
                      <span className={isManager ? "text-emerald-700 font-semibold" : isDeputy ? "text-indigo-700 font-semibold" : "text-blue-700 font-semibold"}>
                        {isManager ? "Trưởng phòng" : isDeputy ? "Phó phòng" : "Chuyên viên"}
                      </span>
                    </div>
                  </div>

                  {/* Menu actions */}
                  <div className="space-y-1">
                    <Link
                      to="/profile"
                      onClick={() => setShowUserDropdown(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-btn hover:bg-slate-100 text-text-primary transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-brand-700" />
                      <span>Hồ sơ tài khoản</span>
                    </Link>

                    {isMockMode ? <div className="pt-2 border-t border-border/60">
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-2.5 mb-1.5">
                        Đổi tài khoản demo:
                      </div>
                      <div className="space-y-0.5">
                        {users.map((u) => {
                          const isAct = u.id === currentUser?.id;
                          const isLocked = u.status !== "ACTIVE";
                          return (
                            <button
                              key={u.id}
                              disabled={isLocked}
                              onClick={async () => {
                                if (isLocked) return;
                                await switchUser(u.id);
                                setShowUserDropdown(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                                isAct
                                  ? "bg-brand-50 text-brand-800 font-semibold"
                                  : isLocked
                                  ? "opacity-40 cursor-not-allowed text-text-muted"
                                  : "hover:bg-slate-50 text-text-secondary"
                              }`}
                            >
                              <span className="truncate">
                                {u.displayName} ({isLocked ? "Đã khóa" : u.role === "MANAGER" ? "Trưởng phòng" : "Chuyên viên"})
                              </span>
                              {isAct && <Check className="w-3.5 h-3.5 text-brand-700 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div> : (
                      <button
                        type="button"
                        onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
                        className="mt-2 w-full rounded px-2.5 py-2 text-left text-sm text-danger hover:bg-red-50"
                      >
                        Đăng xuất
                      </button>
                    )}

                    {/* Reset seed data */}
                    <div className="pt-2 border-t border-border/60">
                      <button
                        onClick={handleResetData}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-btn hover:bg-red-50 text-danger transition-colors font-medium"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset dữ liệu mẫu chuẩn</span>
                      </button>
                    </div>

                    {/* Logout / Switch page */}
                    <div className="pt-1 border-t border-border/60">
                      <Link
                        to="/login"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-btn hover:bg-slate-100 text-text-muted hover:text-text-primary transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Chọn lại tài khoản demo</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Search Overlay Bar */}
        {mobileSearchOpen && (
          <div className="sm:hidden bg-surface/78 backdrop-blur-sm border-b border-border p-3 flex items-center gap-2 z-20">
            <Search className="w-4 h-4 text-text-muted shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mã việc hoặc tên..."
              className="flex-1 h-9 px-2 rounded-btn bg-slate-50 border border-border text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
            <button
              onClick={() => {
                setMobileSearchOpen(false);
                setSearchQuery("");
              }}
              className="text-xs text-text-muted hover:text-text-primary px-1"
            >
              Hủy
            </button>
          </div>
        )}

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden sticky top-16 z-20 max-h-[calc(100dvh-4rem)] overflow-y-auto bg-surface/90 backdrop-blur-sm border-b border-border p-4 space-y-1 shadow-lg">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-3 mb-2">
              {isManager ? "Quản trị & Điều hành (Manager)" : "Không gian Chuyên viên (Staff)"}
            </div>

            {currentNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path === "/dashboard" && location.pathname === "/");

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-brand-700 font-semibold text-white shadow-sm"
                      : "font-medium text-text-secondary hover:bg-white/65 hover:text-text-primary"
                  }`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${isActive ? "text-white" : "text-text-muted group-hover:bg-white/80"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {getNavCount(item.path) !== undefined && (
                    <span className={`ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${isActive ? "bg-white/15 text-white" : "bg-slate-100 text-text-muted group-hover:bg-brand-50 group-hover:text-brand-700"}`}>
                      {getNavCount(item.path)}
                    </span>
                  )}
                </Link>
              );
            })}

            {isMockMode && <div className="pt-2 border-t border-border mt-2">
              <Link
                to="/ui-kit"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 rounded-lg"
              >
                <Palette className="w-4 h-4" />
                <span>Design System (UI Kit)</span>
              </Link>
            </div>}
          </div>
        )}

        {/* Content Body Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto pb-28">
          <div>
            {isMockMode && isP1Route && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                Dữ liệu mẫu · Tính năng P1 đang chạy trên bản dùng thử và chưa kết nối API thật.
              </div>
            )}
            {isMockMode && hasP1TaskControls && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                Các thao tác việc nhóm/cá nhân, việc con, xin gia hạn và đổi chủ trì thuộc P1; hiện chỉ chạy trên dữ liệu mẫu.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Floating Developer Tools & Role Switcher */}
      {isMockMode && <DevToolbar />}
    </div>
  );
}
