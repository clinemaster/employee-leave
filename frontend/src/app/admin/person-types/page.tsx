"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  useGetPersonTypesQuery,
  useCreatePersonTypeMutation,
  useUpdatePersonTypeMutation,
  useDeactivatePersonTypeMutation,
  useActivatePersonTypeMutation,
  useReorderPersonTypesMutation,
} from "@/features/leave/personTypesApi";
import type { PersonType } from "@/types";

// Wahusika (traveler/person type) catalog admin page — copies
// /admin/leave-types's structure (list + create + inline edit + activate/
// deactivate + up/down bulk reorder) field-for-field, since person types
// are the row headers of the Travel Payment Request step's NAULI section.
// `code` is required and unique on the backend (same as LeaveType), so the
// create form and edit row both collect it, not just `name`.
export default function AdminPersonTypesPage() {
  const { data: personTypes, isLoading } = useGetPersonTypesQuery();
  const [createPersonType, { isLoading: isCreating }] = useCreatePersonTypeMutation();
  const [updatePersonType, { isLoading: isSaving }] = useUpdatePersonTypeMutation();
  const [deactivatePersonType] = useDeactivatePersonTypeMutation();
  const [activatePersonType] = useActivatePersonTypeMutation();
  const [reorderPersonTypes] = useReorderPersonTypesMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim() || !code.trim()) return;
    setCreateError(null);
    try {
      await createPersonType({ name, code, is_active: true, sort_order: (personTypes?.length ?? 0) + 1 }).unwrap();
      setName("");
      setCode("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create person type. Please try again."));
    }
  }

  const sorted = [...(personTypes ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // POST /api/person-types/reorder/ — bulk-updates sort_order for the two
  // swapped rows in one atomic request, mirroring /admin/leave-types.
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    await reorderPersonTypes([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]).unwrap();
  }

  function startEdit(pt: PersonType) {
    setEditingId(pt.id);
    setEditName(pt.name);
    setEditCode(pt.code ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    if (!editName.trim() || !editCode.trim()) return;
    setEditError(null);
    try {
      await updatePersonType({ id, name: editName, code: editCode }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(extractErrorMessage(err, "Failed to save changes. Please try again."));
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Manage Person Types (Wahusika)</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add Person Type</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCreate} disabled={isCreating}>
              Add
            </Button>
          </div>
        </div>
        {createError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError}
          </p>
        ) : null}
      </Card>

      <Card>
        {editError ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {editError}
          </p>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-500">No person types configured yet.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">S/No</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((pt, index) => {
                const isEditing = editingId === pt.id;
                return (
                  <tr key={pt.id}>
                    <td className="py-2 pr-4">{index + 1}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Move up"
                          className="rounded border border-gray-300 px-1.5 disabled:opacity-30"
                          disabled={index === 0 || isEditing}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          className="rounded border border-gray-300 px-1.5 disabled:opacity-30"
                          disabled={index === sorted.length - 1 || isEditing}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </button>
                        <span>{pt.sort_order}</span>
                      </div>
                    </td>
                    {isEditing ? (
                      <>
                        <td className="py-2 pr-4">
                          <Input
                            aria-label="Edit code"
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            aria-label="Edit name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-4">{pt.is_active ? "Active" : "Inactive"}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button onClick={() => saveEdit(pt.id)} disabled={isSaving}>
                            Save
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4">{pt.code}</td>
                        <td className="py-2 pr-4">{pt.name}</td>
                        <td className="py-2 pr-4">{pt.is_active ? "Active" : "Inactive"}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button variant="secondary" onClick={() => startEdit(pt)}>
                            Edit
                          </Button>
                          {pt.is_active ? (
                            <Button variant="danger" onClick={() => deactivatePersonType({ id: pt.id })}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" onClick={() => activatePersonType({ id: pt.id })}>
                              Activate
                            </Button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
