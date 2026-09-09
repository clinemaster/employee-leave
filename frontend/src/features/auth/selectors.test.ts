import { selectPermissions, selectIsRole } from "./selectors";
import type { RootState } from "@/store";
import type { User } from "@/types";

function stateWithRole(role: User["role"] | null): RootState {
  return {
    auth: {
      user: role
        ? ({
            id: 1,
            username: "u",
            full_name: "U",
            email: "u@example.com",
            role,
            is_active: true,
          } as User)
        : null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: Boolean(role),
    },
  } as unknown as RootState;
}

describe("selectPermissions", () => {
  it("derives EMPLOYEE permissions", () => {
    const perms = selectPermissions(stateWithRole("EMPLOYEE"));
    expect(perms.canCreateLeaveApplication).toBe(true);
    expect(perms.canRecommend).toBe(false);
    expect(perms.canVerify).toBe(false);
    expect(perms.canApprove).toBe(false);
    expect(perms.canViewAllApplications).toBe(false);
  });

  it("derives HOD-family permissions (can create + recommend + view all)", () => {
    for (const role of ["HEAD_OF_DEPARTMENT", "HEAD_OF_SECTION", "HEAD_OF_UNIT"] as const) {
      const perms = selectPermissions(stateWithRole(role));
      expect(perms.canCreateLeaveApplication).toBe(true);
      expect(perms.canRecommend).toBe(true);
      expect(perms.canViewAllApplications).toBe(true);
      expect(perms.canApprove).toBe(false);
    }
  });

  it("derives HR_ADMIN permissions", () => {
    const perms = selectPermissions(stateWithRole("HR_ADMIN"));
    expect(perms.canVerify).toBe(true);
    expect(perms.canRecommend).toBe(false);
    expect(perms.canViewAllApplications).toBe(true);
  });

  it("derives AUTHORIZING_OFFICER permissions", () => {
    const perms = selectPermissions(stateWithRole("AUTHORIZING_OFFICER"));
    expect(perms.canApprove).toBe(true);
    expect(perms.canViewAllApplications).toBe(true);
  });

  it("derives SYSTEM_ADMIN permissions (manage everything, cannot itself create by role rule)", () => {
    const perms = selectPermissions(stateWithRole("SYSTEM_ADMIN"));
    expect(perms.canManageLeaveTypes).toBe(true);
    expect(perms.canManageHolidays).toBe(true);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canViewAllApplications).toBe(true);
    expect(perms.canCreateLeaveApplication).toBe(false);
  });

  it("returns all-false permissions when there is no role", () => {
    const perms = selectPermissions(stateWithRole(null));
    expect(perms).toEqual({
      canCreateLeaveApplication: false,
      canRecommend: false,
      canVerify: false,
      canApprove: false,
      canManageLeaveTypes: false,
      canManageHolidays: false,
      canManageUsers: false,
      canViewAllApplications: false,
    });
  });
});

describe("selectIsRole", () => {
  it("returns true only when the current user's role matches", () => {
    const state = stateWithRole("HR_ADMIN");
    expect(selectIsRole("HR_ADMIN")(state)).toBe(true);
    expect(selectIsRole("EMPLOYEE")(state)).toBe(false);
  });

  it("returns false when there is no user", () => {
    const state = stateWithRole(null);
    expect(selectIsRole("EMPLOYEE")(state)).toBe(false);
  });
});
