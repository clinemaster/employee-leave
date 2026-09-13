import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { getPermissions, type Permissions } from "@/lib/permissions";
import { selectCurrentUser, selectCurrentUserRole } from "@/store/slices/authSlice";
import { allUserRoles, type Role } from "@/types";

export { selectCurrentUser, selectCurrentUserRole, selectIsAuthenticated } from "@/store/slices/authSlice";

// The full set of roles the current user holds (base `role` + additional_roles).
export const selectCurrentUserRoles = createSelector(
  [selectCurrentUser],
  (user) => allUserRoles(user)
);

export const selectPermissions = createSelector(
  [selectCurrentUserRoles],
  (roles): Permissions => getPermissions(roles)
);

export const selectIsRole = (role: Role) => (state: RootState) =>
  state.auth.user ? allUserRoles(state.auth.user).includes(role) : false;
