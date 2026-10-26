import { AppShell } from "../components/layout/AppShell";
import { useSession } from "../features/auth/SessionContext";
import { ManagerDashboard } from "../features/dashboard/ManagerDashboard";
import { StaffDashboard } from "../features/dashboard/StaffDashboard";
import { DevToolbar } from "../features/dev/DevToolbar";
import { Breadcrumb } from "../components/ui";

export function App() {
  const { isManager } = useSession();

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb
          items={[
            {
              label: isManager ? "Tổng quan điều hành" : "Tổng quan của tôi",
            },
          ]}
        />

        {/* Render role-specific dashboard reading directly from MockRepository and selectors */}
        {isManager ? <ManagerDashboard /> : <StaffDashboard />}
      </div>

      {/* Floating Developer Tools & Role Switcher */}
      <DevToolbar />
    </AppShell>
  );
}
