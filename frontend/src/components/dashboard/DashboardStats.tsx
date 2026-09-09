"use client";

import { StatCard } from "@/components/dashboard/StatCard";
import { useGetDashboardStatsQuery } from "@/features/dashboard/dashboardApi";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUserRole } from "@/features/auth/selectors";

// Real, server-computed stats from GET /api/dashboard-stats/ (see
// /API.md "Dashboard stats") — replaces the earlier client-side
// approximation that only covered the first page of the applications list.
// Shape is role-scoped; render only the fields relevant to the caller.
export function DashboardStats() {
  const role = useAppSelector(selectCurrentUserRole);
  const { data, isLoading } = useGetDashboardStatsQuery();

  if (isLoading || !data) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Loading..." value={0} />
      </div>
    );
  }

  let cards: { label: string; value: number }[] = [];

  if (role === "EMPLOYEE") {
    cards = [
      { label: "Draft", value: data.draft ?? 0 },
      { label: "Pending", value: data.pending ?? 0 },
      { label: "Approved", value: data.approved ?? 0 },
      { label: "Denied", value: data.denied ?? 0 },
      { label: "Returned", value: data.returned ?? 0 },
    ];
  } else if (role === "HEAD_OF_DEPARTMENT" || role === "HEAD_OF_SECTION" || role === "HEAD_OF_UNIT") {
    cards = [
      { label: "Pending Recommendation", value: data.pending_recommendation ?? 0 },
      { label: "Recommended", value: data.recommended ?? 0 },
      { label: "Returned", value: data.returned ?? 0 },
      { label: "Completed", value: data.completed ?? 0 },
    ];
  } else if (role === "HR_ADMIN") {
    cards = [
      { label: "Pending Verification", value: data.pending_verification ?? 0 },
      { label: "Verified", value: data.verified ?? 0 },
      { label: "Returned", value: data.returned ?? 0 },
      { label: "Approved", value: data.approved ?? 0 },
      { label: "Denied", value: data.denied ?? 0 },
    ];
  } else if (role === "AUTHORIZING_OFFICER") {
    cards = [
      { label: "Pending Authorization", value: data.pending_authorization ?? 0 },
      { label: "Approved", value: data.approved ?? 0 },
      { label: "Denied", value: data.denied ?? 0 },
      { label: "Returned", value: data.returned ?? 0 },
    ];
  } else if (role === "SYSTEM_ADMIN") {
    cards = [
      { label: "Draft", value: data.draft ?? 0 },
      { label: "In Progress", value: data.in_progress ?? 0 },
      { label: "Approved", value: data.approved ?? 0 },
      { label: "Denied", value: data.denied ?? 0 },
      { label: "Archived", value: data.archived ?? 0 },
      { label: "Total", value: data.total_applications ?? 0 },
    ];
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} />
      ))}
    </div>
  );
}
