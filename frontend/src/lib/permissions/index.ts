import type { Role } from "@/types";

// Central role-based UI permission derivation. This is UX-only convenience —
// the backend is the real authority for enforcement (RBAC on the API).

export interface Permissions {
  canCreateLeaveApplication: boolean;
  canRecommend: boolean; // HOD Section B1
  canVerify: boolean; // HR Section B2
  canApprove: boolean; // Authorizing Officer Section C
  canManageLeaveTypes: boolean;
  canManageHolidays: boolean;
  canViewAllApplications: boolean;
}

const rolePermissions: Record<Role, Permissions> = {
  EMPLOYEE: {
    canCreateLeaveApplication: true,
    canRecommend: false,
    canVerify: false,
    canApprove: false,
    canManageLeaveTypes: false,
    canManageHolidays: false,
    canViewAllApplications: false,
  },
  HOD: {
    canCreateLeaveApplication: true,
    canRecommend: true,
    canVerify: false,
    canApprove: false,
    canManageLeaveTypes: false,
    canManageHolidays: false,
    canViewAllApplications: true,
  },
  HR: {
    canCreateLeaveApplication: true,
    canRecommend: false,
    canVerify: true,
    canApprove: false,
    canManageLeaveTypes: false,
    canManageHolidays: false,
    canViewAllApplications: true,
  },
  AUTHORIZING_OFFICER: {
    canCreateLeaveApplication: true,
    canRecommend: false,
    canVerify: false,
    canApprove: true,
    canManageLeaveTypes: false,
    canManageHolidays: false,
    canViewAllApplications: true,
  },
  ADMIN: {
    canCreateLeaveApplication: true,
    canRecommend: false,
    canVerify: false,
    canApprove: false,
    canManageLeaveTypes: true,
    canManageHolidays: true,
    canViewAllApplications: true,
  },
};

export function getPermissions(role: Role | null | undefined): Permissions {
  if (!role || !(role in rolePermissions)) {
    return {
      canCreateLeaveApplication: false,
      canRecommend: false,
      canVerify: false,
      canApprove: false,
      canManageLeaveTypes: false,
      canManageHolidays: false,
      canViewAllApplications: false,
    };
  }
  return rolePermissions[role];
}

// Maps each role to its "home" route prefix, used by guards + post-login redirect.
export const roleHomeRoute: Record<Role, string> = {
  EMPLOYEE: "/employee/applications",
  HOD: "/hod/applications",
  HR: "/hr/applications",
  AUTHORIZING_OFFICER: "/authorization/applications",
  ADMIN: "/admin/leave-types",
};

// Maps a route prefix to the roles allowed on it, used by the client-side guard.
export const routeRoleMap: { prefix: string; roles: Role[] }[] = [
  { prefix: "/employee", roles: ["EMPLOYEE", "HOD", "HR", "AUTHORIZING_OFFICER", "ADMIN"] },
  { prefix: "/hod", roles: ["HOD", "ADMIN"] },
  { prefix: "/hr", roles: ["HR", "ADMIN"] },
  { prefix: "/authorization", roles: ["AUTHORIZING_OFFICER", "ADMIN"] },
  { prefix: "/admin", roles: ["ADMIN"] },
];
