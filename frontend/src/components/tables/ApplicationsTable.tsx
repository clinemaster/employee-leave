import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import type { LeaveApplication } from "@/types";

export function ApplicationsTable({
  items,
  detailBasePath,
}: {
  items: LeaveApplication[];
  detailBasePath: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No applications found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-4 font-medium">Applicant</th>
            <th className="py-2 pr-4 font-medium">Leave Type</th>
            <th className="py-2 pr-4 font-medium">Dates</th>
            <th className="py-2 pr-4 font-medium">Days</th>
            <th className="py-2 pr-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
