import type { Role } from "@/types";
import { HOD_ROLES } from "@/types";

// Central role-based UI permission derivation. This is UX-only convenience —
// the backend is the real authority for enforcement (RBAC on the API, see
// /API.md — row-level access + section-scoped edit checks are all server-side).

export interface Permissions {
  canCreateLeaveApplication: boolean;
  canRecommend: boolean; // HOD/HOS/HOU — Section B1
  canVerify: boolean; // HR_ADMIN — Section B2
  canApprove: boolean; // AUTHORIZING_OFFICER — Section C
  canManageLeaveTypes: boolean;
  canManageHolidays: boolean;
  canManageUsers: boolean;
  canViewAllApplications: boolean;
}

// Every user is EMPLOYEE by default and may additionally hold roles like
// HEAD_OF_DEPARTMENT (see User.additional_roles) — permissions are derived
// from the full set of roles a user holds, not just their base `role`.
function buildPermissions(roles: Role[]): Permissions {
  const has = (r: Role) => roles.includes(r);
  const isHod = roles.some((r) => HOD_ROLES.includes(r));
  return {
    canCreateLeaveApplication: has("EMPLOYEE") || isHod, // any employee (incl. line managers) can apply
    canRecommend: isHod,
    canVerify: has("HR_ADMIN"),
    canApprove: has("AUTHORIZING_OFFICER"),
    canManageLeaveTypes: has("SYSTEM_ADMIN"),
    canManageHolidays: has("SYSTEM_ADMIN"),
    canManageUsers: has("SYSTEM_ADMIN"),
    canViewAllApplications: isHod || has("HR_ADMIN") || has("AUTHORIZING_OFFICER") || has("SYSTEM_ADMIN"),
  };
}

const emptyPermissions: Permissions = {
  canCreateLeaveApplication: false,
  canRecommend: false,
  canVerify: false,
  canApprove: false,
  canManageLeaveTypes: false,
  canManageHolidays: false,
  canManageUsers: false,
  canViewAllApplications: false,
};

export function getPermissions(roles: Role[] | Role | null | undefined): Permissions {
  if (!roles) return emptyPermissions;
  const list = Array.isArray(roles) ? roles : [roles];
  if (list.length === 0) return emptyPermissions;
  return buildPermissions(list);
}

// Maps each role to its "home" route prefix, used by guards + post-login redirect.
export const roleHomeRoute: Record<Role, string> = {
  EMPLOYEE: "/employee/applications",
  HEAD_OF_DEPARTMENT: "/hod/applications",
  HEAD_OF_DIVISION: "/hod/applications",
  HEAD_OF_SUPPORT_DIVISION: "/hod/applications",
  HEAD_OF_SECTION: "/hod/applications",
  HEAD_OF_UNIT: "/hod/applications",
  HR_ADMIN: "/hr/applications",
  AUTHORIZING_OFFICER: "/authorization/applications",
  SYSTEM_ADMIN: "/admin/leave-types",
};

// Maps a route prefix to the roles allowed on it, used by the client-side guard.
// Every role can also see /employee (their own applications, since anyone —
// including line managers — can be a leave applicant).
const allRoles: Role[] = [
  "EMPLOYEE",
  "HEAD_OF_DEPARTMENT",
  "HEAD_OF_DIVISION",
  "HEAD_OF_SUPPORT_DIVISION",
  "HEAD_OF_SECTION",
  "HEAD_OF_UNIT",
  "HR_ADMIN",
  "AUTHORIZING_OFFICER",
  "SYSTEM_ADMIN",
];

export const routeRoleMap: { prefix: string; roles: Role[] }[] = [
  { prefix: "/employee", roles: allRoles },
  { prefix: "/hod", roles: [...HOD_ROLES, "SYSTEM_ADMIN"] },
  { prefix: "/hr", roles: ["HR_ADMIN", "SYSTEM_ADMIN"] },
  { prefix: "/authorization", roles: ["AUTHORIZING_OFFICER", "SYSTEM_ADMIN"] },
  { prefix: "/admin", roles: ["SYSTEM_ADMIN"] },
];
