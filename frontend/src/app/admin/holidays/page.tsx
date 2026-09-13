"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  useGetHolidaysQuery,
  useCreateHolidayMutation,
  useDeleteHolidayMutation,
} from "@/features/leave/catalogApi";

export default function AdminHolidaysPage() {
  const { data: holidays, isLoading } = useGetHolidaysQuery();
  const [createHoliday, { isLoading: isCreating }] = useCreateHolidayMutation();
  const [deleteHoliday] = useDeleteHolidayMutation();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !date) return;
    await createHoliday({ name, date, is_recurring: isRecurring }).unwrap();
    setName("");
    setDate("");
    setIsRecurring(false);
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Manage Holidays</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add Holiday</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1 text-sm text-gray-700">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              Recurring
            </label>
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
                <th className="py-2 pr-4">S/No</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays?.map((h, index) => (
                <tr key={h.id}>
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">{h.date}</td>
                  <td className="py-2 pr-4">{h.name}</td>
                  <td className="py-2 pr-4">
                    <Button variant="danger" onClick={() => deleteHoliday({ id: h.id })}>
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
