import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import type { LeaveApplicationListItem } from "@/types";

export function ApplicationsTable({
  items,
  detailBasePath,
}: {
  items: LeaveApplicationListItem[];
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
            <th className="py-2 pr-4 font-medium">Stage</th>
            <th className="py-2 pr-4 font-medium">Last Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4">
                <Link href={`${detailBasePath}/${item.id}`} className="text-blue-600 hover:underline">
                  {item.applicantName}
                </Link>
              </td>
              <td className="py-2 pr-4">{item.leaveTypeName}</td>
              <td className="py-2 pr-4">
                {item.startDate} &ndash; {item.endDate}
              </td>
              <td className="py-2 pr-4">{item.workingDays ?? "-"}</td>
              <td className="py-2 pr-4">
                <StatusBadge status={item.status} />
              </td>
              <td className="py-2 pr-4">{item.stage}</td>
              <td className="py-2 pr-4 text-gray-500">{item.lastAction ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
