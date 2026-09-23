"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  useCreateCustomRoleMutation,
  useDeleteCustomRoleMutation,
  useGetCustomRolesQuery,
  useGetRolePermissionsQuery,
} from "@/features/accounts/rolePermissionsApi";

// SYSTEM_ADMIN-only "Roles" list — click a role to manage its permissions
// (see [role]/page.tsx, styled after ADLS's Permissions screen). "Add Role"
// creates a plain permission-holder role (see backend accounts.models.
// CustomRole) that can then have permissions attached the same way as any
// built-in role.
export default function RolesPage() {
  const { data, isLoading } = useGetRolePermissionsQuery();
  const { data: customRoles } = useGetCustomRolesQuery();
  const [createCustomRole, { isLoading: isCreating }] = useCreateCustomRoleMutation();
  const [deleteCustomRole] = useDeleteCustomRoleMutation();

  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const sortedRoles = data
    ? [...data.roles].sort((a, b) => a.display_name.localeCompare(b.display_name))
    : [];
  const customRoleIdByCode = new Map((customRoles ?? []).map((r) => [r.code, r.id]));

  async function handleCreate() {
    if (!code.trim() || !displayName.trim()) return;
    setCreateError(null);
    try {
      await createCustomRole({ code, display_name: displayName }).unwrap();
      setCode("");
      setDisplayName("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create role. Please try again."));
    }
  }

  async function handleDelete(roleCode: string) {
    const id = customRoleIdByCode.get(roleCode);
    if (id == null) return;
    if (!window.confirm(`Delete role "${roleCode}"? This cannot be undone.`)) return;
    try {
      await deleteCustomRole(id).unwrap();
    } catch (err) {
      window.alert(extractErrorMessage(err, "Failed to delete role."));
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Roles</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add Role</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="roleCode">Code</Label>
            <Input
              id="roleCode"
              placeholder="e.g. REGIONAL_MANAGER"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="roleDisplayName">Display Name</Label>
            <Input
              id="roleDisplayName"
              placeholder="e.g. Regional Manager"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCreate} disabled={isCreating || !code.trim() || !displayName.trim()}>
              Add Role
            </Button>
          </div>
        </div>
        {createError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-gray-500">
          A new role starts with no permissions — attach them from its Permissions page below.
        </p>
      </Card>

      {isLoading || !data ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <Card className="p-0">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Display Name</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRoles.map((role) => {
                const isCustom = customRoleIdByCode.has(role.code);
                return (
                  <tr key={role.code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {role.code}
                      {isCustom ? (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-sans uppercase text-gray-500">
                          Custom
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{role.display_name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/roles/${role.code}`}
                          className="inline-flex items-center gap-1 text-gray-500 hover:text-blue-700"
                        >
                          Permissions
                          <span aria-hidden>{"›"}</span>
                        </Link>
                        {isCustom ? (
                          <Button variant="danger" onClick={() => handleDelete(role.code)}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
