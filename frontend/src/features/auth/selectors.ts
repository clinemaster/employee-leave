import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { getPermissions, type Permissions } from "@/lib/permissions";
import { selectCurrentUserRole } from "@/store/slices/authSlice";

export { selectCurrentUser, selectCurrentUserRole, selectIsAuthenticated } from "@/store/slices/authSlice";

export const selectPermissions = createSelector(
  [selectCurrentUserRole],
  (role): Permissions => getPermissions(role)
);

export const selectIsRole = (role: string) => (state: RootState) =>
  state.auth.user?.role === role;
