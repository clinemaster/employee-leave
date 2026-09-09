"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApplicationsTable } from "@/components/tables/ApplicationsTable";
import { useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";
import type { LeaveApplicationListParams } from "@/features/leave/leaveApi";

interface Tab {
  label: string;
  status?: string;
}

// `extraParams` lets callers (e.g. the HR page) wire additional query params
// (employee, check number, department, station, leave type, date range) into
// the same list endpoint used for the tabs. Changing `extraParams` resets to
// page 1. Pagination is server-side (`?page=`), matching /API.md's
// PageNumberPagination (`page_size=25`).
export function TabbedApplications({
  tabs,
  detailBasePath,
  extraParams,
}: {
  tabs: Tab[];
  detailBasePath: string;
  extraParams?: Omit<LeaveApplicationListParams, "status" | "page">;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [page, setPage] = useState(1);
  const active = tabs[activeIndex];

  // Reset to page 1 whenever the tab or filters change, without a
  // setState-in-effect: track the filter "key" that was last paginated and
  // reset synchronously during render if it changed (React's documented
  // pattern for derived state resets).
  const resetKey = `${activeIndex}:${JSON.stringify(extraParams ?? {})}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const { data, isLoading } = useGetLeaveApplicationsQuery({
    status: active.status,
    page,
    ...extraParams,
  });

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-gray-200">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            onClick={() => setActiveIndex(index)}
            className={clsx(
              "border-b-2 px-3 py-2 text-sm font-medium",
              index === activeIndex ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ApplicationsTable
          items={data?.results ?? []}
          detailBasePath={detailBasePath}
          pagination={{ page, count: data?.count ?? 0, onPageChange: setPage }}
        />
      )}
    </div>
  );
}
