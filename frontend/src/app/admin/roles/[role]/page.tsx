"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  useDeleteCustomRoleMutation,
  useGetCustomRolesQuery,
  useGetRolePermissionsQuery,
  useUpdateRolePermissionsMutation,
} from "@/features/accounts/rolePermissionsApi";

// Groups the flat permission catalog into named sections for display only —
// the backend (accounts.models.Permission) has no notion of categories,
// this is purely a presentation grouping mirroring ADLS's Permissions screen
// (numbered, collapsible sections of "Can ..." checkboxes).
const CATEGORIES: { title: string; permissions: string[] }[] = [
  {
    title: "Leave Workflow",
    permissions: [
      "CREATE_LEAVE_APPLICATION",
      "RECOMMEND_LEAVE",
      "CAG_REVIEW_LEAVE",
      "AAG_REVIEW_LEAVE",
      "VERIFY_LEAVE",
      "APPROVE_LEAVE",
    ],
  },
  { title: "User Management", permissions: ["MANAGE_USERS"] },
  { title: "Organization Management", permissions: ["MANAGE_ORGANIZATION"] },
  {
    title: "Leave Configuration",
    permissions: ["MANAGE_LEAVE_TYPES", "MANAGE_PERSON_TYPES", "MANAGE_LEAVE_POLICIES"],
  },
  { title: "Reports", permissions: ["VIEW_REPORTS"] },
];

export default function RolePermissionsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = use(params);
  const router = useRouter();
  const { data, isLoading } = useGetRolePermissionsQuery();
  const { data: customRoles } = useGetCustomRolesQuery();
  const [updateRolePermissions, { isLoading: isSaving }] = useUpdateRolePermissionsMutation();
  const [deleteCustomRole, { isLoading: isDeleting }] = useDeleteCustomRoleMutation();

  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([CATEGORIES[0].title]));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setSelected(data.matrix[role] ?? []);
  }, [data, role]);

  const isSystemAdmin = role === "SYSTEM_ADMIN";
  const roleDisplayName = data?.roles.find((r) => r.code === role)?.display_name ?? role;
  const permissionLabel = (code: string) =>
    data?.permissions.find((p) => p.code === code)?.label ?? code;
  const customRoleId = customRoles?.find((r) => r.code === role)?.id;

  function toggleCategory(title: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function togglePermission(code: string) {
    setSaved(false);
    setSelected((prev) => (prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]));
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    try {
      await updateRolePermissions({ role, permissions: selected }).unwrap();
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save. Please try again."));
    }
  }

  async function handleDelete() {
    if (customRoleId == null) return;
    if (!window.confirm(`Delete role "${roleDisplayName}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteCustomRole(customRoleId).unwrap();
      router.push("/admin/roles");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete role — it may still be assigned to a user."));
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
        <h1 className="text-lg font-semibold text-gray-900">Permissions</h1>
        <button
          type="button"
          onClick={() => router.push("/admin/roles")}
          aria-label="Back to Roles"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100"
        >
          {"←"}
        </button>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="mb-6 flex justify-center">
            <span className="rounded-full bg-emerald-800 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-white">
              {roleDisplayName}
            </span>
          </div>

          <Card className="p-0">
            {CATEGORIES.map((category, index) => {
              const isOpen = expanded.has(category.title);
              return (
                <div key={category.title} className={index > 0 ? "border-t border-gray-100" : undefined}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.title)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-blue-700">{index + 1}</span>
                    <span className="flex-1 text-sm font-semibold uppercase tracking-wide text-gray-700">
                      {category.title}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-gray-400">
                      Permissions
                      <span aria-hidden>{isOpen ? "▴" : "▾"}</span>
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                      {category.permissions.map((code) => (
                        <label key={code} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className={clsx("h-4 w-4 rounded", isSystemAdmin && "opacity-60")}
                            checked={selected.includes(code)}
                            disabled={isSystemAdmin}
                            onChange={() => togglePermission(code)}
                          />
                          {permissionLabel(code)}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Card>

          {!isSystemAdmin ? (
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              {customRoleId != null ? (
                <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? "Deleting..." : "Delete Role"}
                </Button>
              ) : null}
              {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
              {error ? <span className="text-sm text-red-700">{error}</span> : null}
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-500">
              SYSTEM_ADMIN always has every permission and cannot be edited.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
