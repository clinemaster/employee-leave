"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/dashboard/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { ApplicationsTable } from "@/components/tables/ApplicationsTable";
import { LeaveBalances } from "@/components/leave/LeaveBalances";
import { Button } from "@/components/ui/Button";
import { useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";

// NOTE: API.md does not document a dedicated dashboard-stats endpoint, so
// counts here are derived client-side from the (server row-level-scoped)
// applications list — for an EMPLOYEE this is already just their own
// applications. Stats cover the current page only; once a real
// dashboard-stats endpoint lands in API.md this should switch to it (see
// FRONTEND.md "Deferred").
export default function EmployeeApplicationsPage() {
  const [page, setPage] = useState(1);
  const { data: applications, isLoading } = useGetLeaveApplicationsQuery({ page });

  const stats = useMemo(() => {
    const items = applications?.results ?? [];
    return {
      total: items.length,
      draft: items.filter((a) => a.status === "DRAFT").length,
      pending: items.filter((a) =>
        ["SUBMITTED", "PENDING_HOD_REVIEW", "HOD_RECOMMENDED", "PENDING_HR_REVIEW", "HR_VERIFIED", "PENDING_AUTHORIZATION"].includes(
          a.status
        )
      ).length,
      approved: items.filter((a) => ["APPROVED", "PDF_GENERATED", "COMPLETED"].includes(a.status)).length,
      denied: items.filter((a) => a.status === "DENIED").length,
      returned: items.filter((a) => ["RETURNED_TO_EMPLOYEE", "RETURNED_TO_HOD"].includes(a.status)).length,
    };
  }, [applications]);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">My Applications</h1>
        <Link href="/employee/leave/new">
          <Button>New Leave Application</Button>
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Approved" value={stats.approved} />
        <StatCard label="Denied" value={stats.denied} />
        <StatCard label="Returned" value={stats.returned} />
      </div>

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
