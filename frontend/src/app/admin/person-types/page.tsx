"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  useGetPersonTypesQuery,
  useCreatePersonTypeMutation,
  useUpdatePersonTypeMutation,
  useDeactivatePersonTypeMutation,
  useReorderPersonTypesMutation,
} from "@/features/leave/personTypesApi";

// Wahusika (traveler/person type) catalog admin page — copies
// /admin/leave-types's structure (list + create + up/down bulk reorder)
// field-for-field, since person types are the row headers of the Travel
// Payment Request step's NAULI section.
export default function AdminPersonTypesPage() {
  const { data: personTypes, isLoading } = useGetPersonTypesQuery();
  const [createPersonType, { isLoading: isCreating }] = useCreatePersonTypeMutation();
  const [updatePersonType] = useUpdatePersonTypeMutation();
  const [deactivatePersonType] = useDeactivatePersonTypeMutation();
  const [reorderPersonTypes] = useReorderPersonTypesMutation();
  const [name, setName] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    await createPersonType({ name, is_active: true, sort_order: (personTypes?.length ?? 0) + 1 }).unwrap();
    setName("");
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
          <div className="flex items-end">
            <Button onClick={handleCreate} disabled={isCreating}>
              Add
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-500">No person types configured yet.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((pt, index) => (
                <tr key={pt.id}>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        className="rounded border border-gray-300 px-1.5 disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        className="rounded border border-gray-300 px-1.5 disabled:opacity-30"
                        disabled={index === sorted.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <span>{pt.sort_order}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">{pt.name}</td>
                  <td className="py-2 pr-4">{pt.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => updatePersonType({ id: pt.id, name: pt.name })}
                    >
                      Edit
                    </Button>
                    {pt.is_active ? (
                      <Button variant="danger" onClick={() => deactivatePersonType({ id: pt.id })}>
                        Deactivate
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
