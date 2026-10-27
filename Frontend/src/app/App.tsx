import { AppShell } from "../components/layout/AppShell";
import { useSession } from "../features/auth/SessionContext";
import { ManagerDashboard } from "../features/dashboard/ManagerDashboard";
import { StaffDashboard } from "../features/dashboard/StaffDashboard";
import { Breadcrumb } from "../components/ui";

export function App() {
  const { isLeader } = useSession();

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumb
          items={[
            {
              label: isLeader ? "Tổng quan điều hành" : "Tổng quan của tôi",
            },
          ]}
        />

        {/* Render role-specific dashboard reading directly from MockRepository and selectors */}
        {isLeader ? <ManagerDashboard /> : <StaffDashboard />}
      </div>
    </AppShell>
  );
}
