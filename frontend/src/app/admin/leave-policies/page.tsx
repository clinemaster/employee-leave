"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useGetLeaveTypesQuery } from "@/features/leave/catalogApi";
import {
  useGetLeavePoliciesQuery,
  useCreateLeavePolicyMutation,
  useUpdateLeavePolicyMutation,
  useDeleteLeavePolicyMutation,
} from "@/features/leave/policiesApi";
import type { LeavePolicy } from "@/types";

// SYSTEM_ADMIN-only admin UI for /api/leave-policies/ — annual entitlement
// rules that drive the entitlement engine (a leave_type + optional tenure
// band -> annual_entitlement in days). See /API.md "Leave Policies".
const emptyForm = {
  id: null as number | null,
  leave_type: "",
  designation: "",
  min_years_of_service: "",
  max_years_of_service: "",
  annual_entitlement: "",
  is_active: true,
  sort_order: "",
  description: "",
};

export default function AdminLeavePoliciesPage() {
  const { data: leaveTypes } = useGetLeaveTypesQuery();
  const { data: policies, isLoading } = useGetLeavePoliciesQuery();
  const [createLeavePolicy, { isLoading: isCreating }] = useCreateLeavePolicyMutation();
  const [updateLeavePolicy] = useUpdateLeavePolicyMutation();
  const [deleteLeavePolicy] = useDeleteLeavePolicyMutation();

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function leaveTypeName(id: number) {
    return leaveTypes?.find((lt) => lt.id === id)?.name ?? `Leave type #${id}`;
  }

  function startEdit(policy: LeavePolicy) {
    setError(null);
    setForm({
      id: policy.id,
      leave_type: String(policy.leave_type),
      designation: policy.designation ?? "",
      min_years_of_service:
        policy.min_years_of_service === null || policy.min_years_of_service === undefined
          ? ""
          : String(policy.min_years_of_service),
      max_years_of_service:
        policy.max_years_of_service === null || policy.max_years_of_service === undefined
          ? ""
          : String(policy.max_years_of_service),
      annual_entitlement: String(policy.annual_entitlement),
      is_active: policy.is_active,
      sort_order: String(policy.sort_order),
      description: policy.description ?? "",
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!form.leave_type || !form.annual_entitlement.trim()) {
      setError("Leave type and annual entitlement are required.");
      return;
    }
    const minYears = form.min_years_of_service.trim() === "" ? null : Number(form.min_years_of_service);
    const maxYears = form.max_years_of_service.trim() === "" ? null : Number(form.max_years_of_service);
    if (minYears !== null && maxYears !== null && maxYears < minYears) {
      setError("Max years of service cannot be less than min years of service.");
      return;
    }

    const body = {
      leave_type: Number(form.leave_type),
      designation: form.designation.trim(),
      min_years_of_service: minYears,
      max_years_of_service: maxYears,
      annual_entitlement: Number(form.annual_entitlement),
      is_active: form.is_active,
      sort_order: form.sort_order.trim() === "" ? (policies?.length ?? 0) + 1 : Number(form.sort_order),
      description: form.description,
    };

    try {
      if (form.id !== null) {
        await updateLeavePolicy({ id: form.id, ...body }).unwrap();
      } else {
        await createLeavePolicy(body).unwrap();
      }
      resetForm();
    } catch {
      setError("Save failed — check the values and try again.");
    }
  }

  // Sorted by leave type then tenure band (sort_order, ties by id) — mirrors
  // the entitlement engine's own match order per leave type.
  const sorted = [...(policies ?? [])].sort((a, b) => {
    if (a.leave_type !== b.leave_type) return leaveTypeName(a.leave_type).localeCompare(leaveTypeName(b.leave_type));
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Manage Leave Policies</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          {form.id !== null ? "Edit Policy" : "Add Policy"}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="leave_type">Leave Type</Label>
            <select
              id="leave_type"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={form.leave_type}
              onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}
            >
              <option value="">Select...</option>
              {leaveTypes?.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="designation">Designation</Label>
            <Input
              id="designation"
              placeholder="leave blank to apply to all designations"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="min_years">Min Years of Service</Label>
            <Input
              id="min_years"
              type="number"
              placeholder="(blank = no minimum)"
              value={form.min_years_of_service}
              onChange={(e) => setForm((f) => ({ ...f, min_years_of_service: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="max_years">Max Years of Service</Label>
            <Input
              id="max_years"
              type="number"
              placeholder="(blank = no maximum)"
              value={form.max_years_of_service}
              onChange={(e) => setForm((f) => ({ ...f, max_years_of_service: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="annual_entitlement">Annual Entitlement (days)</Label>
            <Input
              id="annual_entitlement"
              type="number"
              value={form.annual_entitlement}
              onChange={(e) => setForm((f) => ({ ...f, annual_entitlement: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              placeholder="(defaults to end)"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSubmit} disabled={isCreating}>
              {form.id !== null ? "Save" : "Add"}
            </Button>
            {form.id !== null ? (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-500">No policies configured — the system default entitlement applies.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Leave Type</th>
                <th className="py-2 pr-4">Designation</th>
                <th className="py-2 pr-4">Tenure Band (years)</th>
                <th className="py-2 pr-4">Entitlement (days)</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">{p.leave_type_name ?? leaveTypeName(p.leave_type)}</td>
                  <td className="py-2 pr-4">{p.designation ? p.designation : "All"}</td>
                  <td className="py-2 pr-4">
                    {p.min_years_of_service ?? "0"}&ndash;{p.max_years_of_service ?? "∞"}
                  </td>
                  <td className="py-2 pr-4">{p.annual_entitlement}</td>
                  <td className="py-2 pr-4">{p.sort_order}</td>
                  <td className="py-2 pr-4">{p.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4 flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(p)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => deleteLeavePolicy({ id: p.id })}>
                      Delete
                    </Button>
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
