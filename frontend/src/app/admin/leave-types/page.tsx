"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  useGetLeaveTypesQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeactivateLeaveTypeMutation,
  useActivateLeaveTypeMutation,
  useReorderLeaveTypesMutation,
} from "@/features/leave/catalogApi";
import type { LeaveType } from "@/types";

export default function AdminLeaveTypesPage() {
  const { data: leaveTypes, isLoading } = useGetLeaveTypesQuery();
  const [createLeaveType, { isLoading: isCreating }] = useCreateLeaveTypeMutation();
  const [updateLeaveType, { isLoading: isSaving }] = useUpdateLeaveTypeMutation();
  const [deactivateLeaveType] = useDeactivateLeaveTypeMutation();
  const [activateLeaveType] = useActivateLeaveTypeMutation();
  const [reorderLeaveTypes] = useReorderLeaveTypesMutation();
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
      await createLeaveType({ name, code, is_active: true, sort_order: (leaveTypes?.length ?? 0) + 1 }).unwrap();
      setName("");
      setCode("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create leave type. Please try again."));
    }
  }

  const sorted = [...(leaveTypes ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // POST /api/leave-types/reorder/ — bulk-updates sort_order for the two
  // swapped rows in one atomic request.
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    await reorderLeaveTypes([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]).unwrap();
  }

  function startEdit(lt: LeaveType) {
    setEditingId(lt.id);
    setEditName(lt.name);
    setEditCode(lt.code);
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
      await updateLeaveType({ id, name: editName, code: editCode }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(extractErrorMessage(err, "Failed to save changes. Please try again."));
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Manage Leave Types</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add Leave Type</h2>
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
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((lt, index) => {
                const isEditing = editingId === lt.id;
                return (
                  <tr key={lt.id}>
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
                        <span>{lt.sort_order}</span>
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
                        <td className="py-2 pr-4">{lt.is_active ? "Active" : "Inactive"}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button onClick={() => saveEdit(lt.id)} disabled={isSaving}>
                            Save
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4">{lt.code}</td>
                        <td className="py-2 pr-4">{lt.name}</td>
                        <td className="py-2 pr-4">{lt.is_active ? "Active" : "Inactive"}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button variant="secondary" onClick={() => startEdit(lt)}>
                            Edit
                          </Button>
                          {lt.is_active ? (
                            <Button variant="danger" onClick={() => deactivateLeaveType({ id: lt.id })}>
                              Deactivate
                            </Button>
                          ) : (
                            <Button variant="secondary" onClick={() => activateLeaveType({ id: lt.id })}>
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
