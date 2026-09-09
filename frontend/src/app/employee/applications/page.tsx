"use client";

import Link from "next/link";
import { AppShell } from "@/components/dashboard/AppShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { ApplicationsTable } from "@/components/tables/ApplicationsTable";
import { Button } from "@/components/ui/Button";
import { useGetDashboardStatsQuery, useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";

export default function EmployeeApplicationsPage() {
  const { data: stats } = useGetDashboardStatsQuery();
  const { data: applications, isLoading } = useGetLeaveApplicationsQuery({ pageSize: 10 });

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">My Applications</h1>
        <Link href="/employee/leave/new">
          <Button>New Leave Application</Button>
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats?.total ?? 0} />
        <StatCard label="Draft" value={stats?.draft ?? 0} />
        <StatCard label="Pending" value={stats?.pending ?? 0} />
        <StatCard label="Approved" value={stats?.approved ?? 0} />
        <StatCard label="Denied" value={stats?.denied ?? 0} />
        <StatCard label="Returned" value={stats?.returned ?? 0} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent Applications</h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <ApplicationsTable items={applications?.results ?? []} detailBasePath="/employee/applications" />
        )}
      </div>
    </AppShell>
  );
}
