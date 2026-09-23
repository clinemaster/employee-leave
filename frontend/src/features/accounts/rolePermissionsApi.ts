import { baseApi } from "@/lib/api/baseApi";

// The "Roles" page (SYSTEM_ADMIN only) — see backend
// apps.accounts.views.RolePermissionsView. Lets sysadmin attach/detach
// coarse permissions to each role; enforced dynamically server-side
// (apps.leave.permissions.HasPermission and the extra role_has_permission
// checks in apps.leave.workflow._check_role_for_action).

export interface RoleOption {
  code: string;
  label: string;
  // The role's full/official title (e.g. "Deputy Auditor General" for DAG) —
  // separate from `label`, shown as the "Display Name" column on the Roles
  // page. See backend accounts.models.ROLE_DISPLAY_NAMES.
  display_name: string;
}

export interface PermissionOption {
  code: string;
  label: string;
}

export interface RolePermissionMatrix {
  roles: RoleOption[];
  permissions: PermissionOption[];
  matrix: Record<string, string[]>;
}

// A SYSTEM_ADMIN-created role beyond the built-in ones (see backend
// accounts.models.CustomRole) — a plain permission-holder, with none of the
// built-in roles' bespoke routing logic (no org-unit matching, etc.).
// `code` is normalized server-side (uppercased, spaces -> underscores).
export interface CustomRole {
  id: number;
  code: string;
  display_name: string;
  created_at: string;
}

export const rolePermissionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getRolePermissions: builder.query<RolePermissionMatrix, void>({
      query: () => "role-permissions/",
      providesTags: ["RolePermissions"],
    }),
    // Fully replaces the given role's permission set (not merged) — SYSTEM_ADMIN's
    // own row is immutable server-side (400 if attempted).
    updateRolePermissions: builder.mutation<RolePermissionMatrix, { role: string; permissions: string[] }>({
      query: (body) => ({ url: "role-permissions/", method: "PUT", body }),
      invalidatesTags: ["RolePermissions"],
    }),
    // The custom roles' own ids (not present in getRolePermissions' merged
    // roles list) — needed to delete one.
    getCustomRoles: builder.query<CustomRole[], void>({
      query: () => "custom-roles/",
      transformResponse: (r: CustomRole[] | { results: CustomRole[] }) => (Array.isArray(r) ? r : r.results),
      providesTags: ["RolePermissions"],
    }),
    // "Add Role" — the new role then shows up in getRolePermissions' roles
    // list (RolePermissions tag invalidation) so permissions can be attached
    // to it right away via updateRolePermissions.
    createCustomRole: builder.mutation<CustomRole, { code: string; display_name: string }>({
      query: (body) => ({ url: "custom-roles/", method: "POST", body }),
      invalidatesTags: ["RolePermissions"],
    }),
    // Fails server-side (400) if any user currently holds this role.
    deleteCustomRole: builder.mutation<void, number>({
      query: (id) => ({ url: `custom-roles/${id}/`, method: "DELETE" }),
      invalidatesTags: ["RolePermissions"],
    }),
  }),
});

export const {
  useGetRolePermissionsQuery,
  useUpdateRolePermissionsMutation,
  useGetCustomRolesQuery,
  useCreateCustomRoleMutation,
  useDeleteCustomRoleMutation,
} = rolePermissionsApi;
