import Link from "next/link";
import clsx from "clsx";
import { LocationBadge, StatusBadge } from "@/components/ui/Badge";
import { DownloadPdfButton, isPdfDownloadable } from "@/components/leave/DownloadPdfButton";
import type { LeaveApplication, LeaveStatus } from "@/types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PaginationProps {
  page: number;
  pageSize?: number;
  count: number;
  onPageChange: (page: number) => void;
}

export function ApplicationsTable({
  items,
  detailBasePath,
  pagination,
  unattendedStatuses,
}: {
  items: LeaveApplication[];
  detailBasePath: string;
  pagination?: PaginationProps;
  // Statuses that mean "still needs this viewer's action" — when given,
  // rows are color-coded amber (needs action) vs green (already attended),
  // matching the dot/row treatment already used on the untabbed Review
  // Queue pages (see components/dashboard/ReviewQueue.tsx).
  unattendedStatuses?: LeaveStatus[];
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No applications found.</p>;
  }

  const pageSize = pagination?.pageSize ?? 25;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.count / pageSize)) : 1;

  return (
    <div>
      {unattendedStatuses ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Needs your action
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Already reviewed
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">S/No</th>
              {unattendedStatuses ? <th className="py-2 pr-4 font-medium"></th> : null}
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
              const unattended = unattendedStatuses?.includes(item.status);
              return (
                <tr
                  key={item.id}
                  className={clsx("hover:bg-gray-50", unattended ? "bg-amber-50/60" : undefined)}
                >
                  <td className="py-2 pr-4">
                    {pagination ? (pagination.page - 1) * pageSize + index + 1 : index + 1}
                  </td>
                  {unattendedStatuses ? (
                    <td className="py-2 pr-4">
                      <span
                        title={unattended ? "Needs your action" : "Already reviewed"}
                        className={clsx(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          unattended ? "bg-amber-500" : "bg-green-500"
                        )}
                      />
                    </td>
                  ) : null}
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
      {pagination && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {pagination.page} of {totalPages} &middot; {pagination.count} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
