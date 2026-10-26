import React from "react";
import { useSession } from "./SessionContext";
import { ForbiddenPage } from "./ForbiddenPage";
import type { UserRole } from "../../shared/data-contract";

export interface RoleRouteGuardProps {
  requiredRole?: UserRole;
  managerOnly?: boolean;
  featureName?: string;
  children: React.ReactNode;
}

export function RoleRouteGuard({
  requiredRole,
  managerOnly = false,
  featureName,
  children,
}: RoleRouteGuardProps) {
  const { currentUser, isManager } = useSession();

  if (managerOnly || requiredRole === "MANAGER") {
    if (!isManager) {
      return (
        <ForbiddenPage
          message={`Tính năng "${featureName || "này"}" chỉ dành cho Trưởng phòng (MANAGER). Chuyên viên không được cấp quyền truy cập.`}
          resourceName={featureName}
        />
      );
    }
  }

  if (requiredRole && currentUser?.role !== requiredRole) {
    return (
      <ForbiddenPage
        message={`Vai trò ${currentUser?.role} không có quyền truy cập vào màn hình này.`}
        resourceName={featureName}
      />
    );
  }

  return <>{children}</>;
}
