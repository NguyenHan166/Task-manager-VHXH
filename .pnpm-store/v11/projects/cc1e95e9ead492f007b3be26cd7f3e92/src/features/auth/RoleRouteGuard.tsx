import React from "react";
import { useSession } from "./SessionContext";
import { ForbiddenPage } from "./ForbiddenPage";
import type { UserRole } from "../../shared/data-contract";

export interface RoleRouteGuardProps {
  requiredRole?: UserRole;
  managerOnly?: boolean;
  adminOnly?: boolean;
  leaderOnly?: boolean;
  featureName?: string;
  children: React.ReactNode;
}

export function RoleRouteGuard({
  requiredRole,
  managerOnly = false,
  adminOnly = false,
  leaderOnly = false,
  featureName,
  children,
}: RoleRouteGuardProps) {
  const { currentUser, isManager, isLeader, isAdmin } = useSession();

  if (adminOnly) {
    if (!isAdmin) {
      const isDeputy = currentUser?.role === "DEPUTY_MANAGER";
      return (
        <ForbiddenPage
          message={
            isDeputy
              ? `Tính năng "${featureName || "này"}" thuộc khối Quản trị hệ thống, chỉ dành riêng cho Trưởng phòng (kiêm Quản trị hệ thống). Phó phòng có đầy đủ quyền điều hành chuyên môn nhưng không có quyền quản trị.`
              : `Tính năng "${featureName || "này"}" thuộc khối Quản trị hệ thống, chỉ dành riêng cho Trưởng phòng. Chuyên viên không được cấp quyền truy cập.`
          }
          resourceName={featureName}
        />
      );
    }
  }

  if (leaderOnly) {
    if (!isLeader) {
      return (
        <ForbiddenPage
          message={`Tính năng "${featureName || "này"}" chỉ dành cho Lãnh đạo phòng (Trưởng phòng hoặc Phó phòng). Chuyên viên không được cấp quyền truy cập.`}
          resourceName={featureName}
        />
      );
    }
  }

  if (managerOnly || requiredRole === "MANAGER") {
    if (!isManager) {
      return (
        <ForbiddenPage
          message={`Tính năng "${featureName || "này"}" chỉ dành cho Trưởng phòng (MANAGER).`}
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
