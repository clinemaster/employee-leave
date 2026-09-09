"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/dashboard/AppShell";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { ApplicationsTable } from "@/components/tables/ApplicationsTable";
import { LeaveBalances } from "@/components/leave/LeaveBalances";
import { Button } from "@/components/ui/Button";
import { useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";

// Stat cards are now real server aggregates from GET /api/dashboard-stats/
// (see DashboardStats component / features/dashboard/dashboardApi.ts) —
// no longer a client-side approximation from the first page of results.
export default function EmployeeApplicationsPage() {
  const [page, setPage] = useState(1);
  const { data: applications, isLoading } = useGetLeaveApplicationsQuery({ page });

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">My Applications</h1>
        <Link href="/employee/leave/new">
          <Button>New Leave Application</Button>
        </Link>
      </div>

      <DashboardStats />

      <div className="mb-6">
        <LeaveBalances />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent Applications</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <ApplicationsTable
            items={applications?.results ?? []}
            detailBasePath="/employee/applications"
            pagination={{ page, count: applications?.count ?? 0, onPageChange: setPage }}
          />
        )}
      </div>
    </AppShell>
  );
}
