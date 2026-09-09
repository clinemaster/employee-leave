import clsx from "clsx";
import type { LeaveStatus } from "@/types";

const statusStyles: Record<LeaveStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  RECOMMENDED: "bg-indigo-100 text-indigo-700",
  RETURNED_BY_HOD: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-teal-100 text-teal-700",
  RETURNED_BY_HR: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  DENIED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status] ?? "bg-gray-100 text-gray-700"
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
