import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { DownloadPdfButton, isPdfDownloadable } from "@/components/leave/DownloadPdfButton";
import type { LeaveApplication } from "@/types";

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
}: {
  items: LeaveApplication[];
  detailBasePath: string;
  pagination?: PaginationProps;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No applications found.</p>;
  }

  const pageSize = pagination?.pageSize ?? 25;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.count / pageSize)) : 1;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">S/No</th>
              <th className="py-2 pr-4 font-medium">Applicant</th>
              <th className="py-2 pr-4 font-medium">Leave Type</th>
              <th className="py-2 pr-4 font-medium">Dates</th>
              <th className="py-2 pr-4 font-medium">Days</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, index) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="py-2 pr-4">
                  {pagination ? (pagination.page - 1) * pageSize + index + 1 : index + 1}
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
                  {isPdfDownloadable(item.status) ? (
                    <DownloadPdfButton applicationId={item.id} status={item.status} />
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
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
