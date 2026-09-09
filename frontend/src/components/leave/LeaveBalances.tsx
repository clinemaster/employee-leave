"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { useGetLeaveTypesQuery } from "@/features/leave/catalogApi";
import { useGetLeaveBalancesQuery } from "@/features/leave/balancesApi";

// Employee-facing (no `employeeId`): current balances for the logged-in
// user. HR-facing (`employeeId` passed, e.g. during review of an
// application): balance lookup for that specific employee.
// GET /api/leave-balances/ — employees see only their own, HR/AO/Admin see
// all filtered by ?employee=.
export function LeaveBalances({ employeeId, title = "Leave Balances" }: { employeeId?: number; title?: string }) {
  const [period, setPeriod] = useState("");
  const { data: leaveTypes } = useGetLeaveTypesQuery();
  const { data: balances, isLoading } = useGetLeaveBalancesQuery({
    employee: employeeId,
    period: period || undefined,
  });

  function leaveTypeName(id: number) {
    return leaveTypes?.find((lt) => lt.id === id)?.name ?? `Leave type #${id}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <div className="w-40">
          <Label htmlFor="period">Period</Label>
          <Input id="period" placeholder="e.g. 2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
      </CardHeader>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !balances || balances.length === 0 ? (
        <p className="text-sm text-gray-500">No balance records found.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">Leave Type</th>
              <th className="py-2 pr-4 font-medium">Period</th>
              <th className="py-2 pr-4 font-medium">Balance (days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {balances.map((b) => (
              <tr key={b.id}>
                <td className="py-2 pr-4">{leaveTypeName(b.leave_type)}</td>
                <td className="py-2 pr-4">{b.period}</td>
                <td className="py-2 pr-4 font-medium">{b.balance_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
