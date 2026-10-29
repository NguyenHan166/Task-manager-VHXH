import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
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
            <Route path="/personal-tasks" element={<PersonalTasksPage />} />

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
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />

            {/* Recurrence Tasks & Rules - accessible to all roles */}
            <Route path="/recurrence" element={<RecurrencePage />} />

            {/* Calendar (Prompt 06) */}
            <Route path="/calendar" element={<CalendarPage />} />

            {/* Chat (Prompt 07) */}
            <Route path="/chat" element={<ChatPage />} />

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

function CreateTaskRoute() {
  return <TaskCreatePage />;
}
