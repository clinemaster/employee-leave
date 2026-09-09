"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  useGetLeaveTypesQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeactivateLeaveTypeMutation,
} from "@/features/leave/catalogApi";

export default function AdminLeaveTypesPage() {
  const { data: leaveTypes, isLoading } = useGetLeaveTypesQuery();
  const [createLeaveType, { isLoading: isCreating }] = useCreateLeaveTypeMutation();
  const [updateLeaveType] = useUpdateLeaveTypeMutation();
  const [deactivateLeaveType] = useDeactivateLeaveTypeMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function handleCreate() {
    if (!name.trim() || !code.trim()) return;
    await createLeaveType({ name, code, is_active: true, sort_order: (leaveTypes?.length ?? 0) + 1 }).unwrap();
    setName("");
    setCode("");
  }

  // No bulk/reorder endpoint is documented in /API.md — swap the two
  // affected rows' `sort_order` via sequential PATCH calls instead.
  const sorted = [...(leaveTypes ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    await Promise.all([
      updateLeaveType({ id: a.id, sort_order: b.sort_order }).unwrap(),
      updateLeaveType({ id: b.id, sort_order: a.sort_order }).unwrap(),
    ]);
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
      </Card>

      <Card>
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
              {sorted.map((lt, index) => (
                <tr key={lt.id}>
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
                      <span>{lt.sort_order}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4">{lt.code}</td>
                  <td className="py-2 pr-4">{lt.name}</td>
                  <td className="py-2 pr-4">{lt.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => updateLeaveType({ id: lt.id, name: lt.name })}
                    >
                      Edit
                    </Button>
                    {lt.is_active ? (
                      <Button variant="danger" onClick={() => deactivateLeaveType({ id: lt.id })}>
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
