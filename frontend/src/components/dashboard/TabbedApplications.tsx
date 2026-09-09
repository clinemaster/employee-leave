"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApplicationsTable } from "@/components/tables/ApplicationsTable";
import { useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";

interface Tab {
  label: string;
  status?: string;
}

export function TabbedApplications({ tabs, detailBasePath }: { tabs: Tab[]; detailBasePath: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = tabs[activeIndex];
  const { data, isLoading } = useGetLeaveApplicationsQuery({
    status: active.status,
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
        <ApplicationsTable items={data?.results ?? []} detailBasePath={detailBasePath} />
      )}
    </div>
  );
}
