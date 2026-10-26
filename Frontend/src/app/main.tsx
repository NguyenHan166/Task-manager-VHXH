import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

            {/* Dashboard / Home */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<App />} />

            {/* Tasks Routes */}
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/create" element={<TaskCreatePage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/personal-tasks" element={<PersonalTasksPage />} />

            {/* Approvals (Manager Only) */}
            <Route
              path="/approvals"
              element={
                <RoleRouteGuard managerOnly featureName="Chờ duyệt kết quả">
                  <ApprovalsPage />
                </RoleRouteGuard>
              }
            />

            {/* Projects (Prompt 06) */}
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />

            {/* Recurrence Rules (Prompt 06 - Manager Only) */}
            <Route
              path="/recurrence"
              element={
                <RoleRouteGuard managerOnly featureName="Nhiệm vụ định kỳ">
                  <RecurrencePage />
                </RoleRouteGuard>
              }
            />

            {/* Calendar (Prompt 06) */}
            <Route path="/calendar" element={<CalendarPage />} />

            {/* Chat (Prompt 07) */}
            <Route path="/chat" element={<ChatPage />} />

            {/* Files (Prompt 07) */}
            <Route path="/files" element={<FilesPage />} />

            {/* Reports (Prompt 08) */}
            <Route path="/reports" element={<ReportsPage />} />

            {/* Members (Manager Only - Prompt 08) */}
            <Route
              path="/members"
              element={
                <RoleRouteGuard managerOnly featureName="Quản lý thành viên">
                  <MembersPage />
                </RoleRouteGuard>
              }
            />

            {/* Settings (Manager Only - Prompt 08) */}
            <Route
              path="/settings"
              element={
                <RoleRouteGuard managerOnly featureName="Cài đặt hệ thống & Nhật ký">
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
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>
);
