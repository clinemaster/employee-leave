"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { LocationBadge, StatusBadge } from "@/components/ui/Badge";
import { DownloadPdfButton, isPdfDownloadable } from "@/components/leave/DownloadPdfButton";
import { useGetLeaveApplicationsQuery } from "@/features/leave/leaveApi";
import type { LeaveStatus } from "@/types";

const PAGE_SIZE = 25;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// A single, untabbed list of every application visible to this role (same
// server-side scope as the existing tabbed pages — see
// apps.leave.permissions.visible_queryset_for/hod_scope_q), newest first
// (backend default ordering, LeaveApplication.Meta.ordering = ['-created_at']),
// color-coded by whether this role still owes it an action.
export function ReviewQueue({
  detailBasePath,
  unattendedStatuses,
}: {
  detailBasePath: string;
  unattendedStatuses: LeaveStatus[];
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetLeaveApplicationsQuery({ page });

  const items = data?.results ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Needs your action
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Already reviewed
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No applications found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">S/No</th>
                <th className="py-2 pr-4 font-medium"></th>
                <th className="py-2 pr-4 font-medium">Applicant</th>
                <th className="py-2 pr-4 font-medium">Leave Type</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
                <th className="py-2 pr-4 font-medium">Days</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Current Location</th>
                <th className="py-2 pr-4 font-medium">Last Updated</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, index) => {
                const unattended = unattendedStatuses.includes(item.status);
                return (
                  <tr
                    key={item.id}
                    className={clsx("hover:bg-gray-50", unattended ? "bg-amber-50/60" : undefined)}
                  >
                    <td className="py-2 pr-4">{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="py-2 pr-4">
                      <span
                        title={unattended ? "Needs your action" : "Already reviewed"}
                        className={clsx(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          unattended ? "bg-amber-500" : "bg-green-500"
                        )}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`${detailBasePath}/${item.id}`} className="text-blue-600 hover:underline">
                        {item.full_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{item.leave_type_name ?? item.leave_type}</td>
                    <td className="py-2 pr-4">
                      {item.start_date} &ndash; {item.last_date}
                    </td>
                    <td className="py-2 pr-4">{item.total_working_days ?? item.working_days_preview ?? "-"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-2 pr-4">
                      {item.current_location ? <LocationBadge location={item.current_location} /> : "-"}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                      {formatDateTime(item.updated_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {isPdfDownloadable(item.status) ? (
                        <DownloadPdfButton applicationId={item.id} status={item.status} />
                      ) : (
                        <span className="text-gray-400">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {totalPages} &middot; {data.count} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
