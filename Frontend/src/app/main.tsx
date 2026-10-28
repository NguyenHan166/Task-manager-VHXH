import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from "react-router-dom";
import { SessionProvider } from "../features/auth/SessionContext";
import { ToastProvider } from "../components/ui/Toast";
import { RoleRouteGuard } from "../features/auth/RoleRouteGuard";
import { LoginPage } from "../features/auth/LoginPage";
import { App } from "./App";
import { TasksPage } from "../features/tasks/TasksPage";
import { TaskCreatePage } from "../features/tasks/TaskCreatePage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";
import { ApprovalsPage } from "../features/tasks/ApprovalsPage";
import { PersonalTasksPage } from "../features/tasks/PersonalTasksPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { RecurrencePage } from "../features/recurrence/RecurrencePage";
import { ChatPage } from "../features/chat/ChatPage";
import { FilesPage } from "../features/files/FilesPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { MembersPage } from "../features/members/MembersPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { UiKitPage } from "./UiKitPage";
import { useSession } from "../features/auth/SessionContext";
import "../styles/tokens.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Không tìm thấy phần tử root");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            {/* Login / Demo account selector */}
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireSession />}>

            {/* Dashboard / Home */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<App />} />

            {/* Tasks Routes */}
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/create" element={<CreateTaskRoute />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/personal-tasks" element={<MockOnlyRoute><PersonalTasksPage /></MockOnlyRoute>} />

            {/* Approvals (Leaders: Manager & Deputy) */}
            <Route
              path="/approvals"
              element={
                <RoleRouteGuard leaderOnly featureName="Chờ duyệt kết quả">
                  <ApprovalsPage />
                </RoleRouteGuard>
              }
            />

            {/* Projects (Prompt 06) */}
            <Route path="/projects" element={<MockOnlyRoute><ProjectsPage /></MockOnlyRoute>} />
            <Route path="/projects/:id" element={<MockOnlyRoute><ProjectDetailPage /></MockOnlyRoute>} />

            {/* Recurrence Tasks & Rules - accessible to all roles */}
            <Route path="/recurrence" element={<MockOnlyRoute><RecurrencePage /></MockOnlyRoute>} />

            {/* Calendar (Prompt 06) */}
            <Route path="/calendar" element={<MockOnlyRoute><CalendarPage /></MockOnlyRoute>} />

            {/* Chat (Prompt 07) */}
            <Route path="/chat" element={<MockOnlyRoute><ChatPage /></MockOnlyRoute>} />

            {/* Files (Prompt 07) */}
            <Route path="/files" element={<FilesPage />} />

            {/* Reports (Prompt 08) */}
            <Route path="/reports" element={<ReportsPage />} />

            {/* Members (Admin Only - Manager kiêm Quản trị) */}
            <Route
              path="/members"
              element={
                <RoleRouteGuard adminOnly featureName="Quản lý thành viên">
                  <MembersPage />
                </RoleRouteGuard>
              }
            />

            {/* Settings (Admin Only - Manager kiêm Quản trị) */}
            <Route
              path="/settings"
              element={
                <RoleRouteGuard adminOnly featureName="Cài đặt hệ thống & Nhật ký">
                  <SettingsPage />
                </RoleRouteGuard>
              }
            />

            {/* Notifications */}
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* User Profile */}
            <Route path="/profile" element={<ProfilePage />} />

            {/* Design System UI Kit */}
            <Route path="/ui-kit" element={<UiKitPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);

function RequireSession() {
  const { currentUser, isLoading } = useSession();
  if (isLoading) {
    return <div className="min-h-screen bg-canvas flex items-center justify-center text-sm text-text-secondary">Đang kiểm tra phiên đăng nhập…</div>;
  }
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function MockOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isMockMode } = useSession();
  if (isMockMode) return <>{children}</>;
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <section className="max-w-lg rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-text-primary">Tính năng sẽ được kết nối ở Phase 09</h1>
        <p className="mt-2 text-sm text-text-secondary">Màn hình này hiện chỉ hoạt động ở chế độ demo. Các luồng P0 đã kết nối API có thể mở từ thanh điều hướng.</p>
        <Link className="mt-5 inline-flex text-sm font-semibold text-brand-700 hover:underline" to="/dashboard">Quay về tổng quan</Link>
      </section>
    </main>
  );
}

function CreateTaskRoute() {
  const { currentUser, isMockMode } = useSession();
  if (isMockMode || currentUser?.role !== "STAFF") return <TaskCreatePage />;
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <section className="max-w-lg rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-text-primary">Tạo việc cá nhân sẽ được kết nối ở Phase 09</h1>
        <p className="mt-2 text-sm text-text-secondary">Hiện tại nhân viên có thể cập nhật và nộp kết quả cho công việc OFFICIAL được giao.</p>
        <Link className="mt-5 inline-flex text-sm font-semibold text-brand-700 hover:underline" to="/tasks">Quay về công việc</Link>
      </section>
    </main>
  );
}
