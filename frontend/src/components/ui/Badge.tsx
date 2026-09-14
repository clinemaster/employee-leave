import clsx from "clsx";
import type { LeaveStatus } from "@/types";

const statusStyles: Record<LeaveStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  PENDING_HOD_REVIEW: "bg-blue-100 text-blue-700",
  HOD_RECOMMENDED: "bg-indigo-100 text-indigo-700",
  PENDING_CAG_REVIEW: "bg-purple-100 text-purple-700",
  CAG_RECOMMENDED: "bg-indigo-100 text-indigo-700",
  RETURNED_TO_EMPLOYEE: "bg-amber-100 text-amber-700",
  PENDING_HR_REVIEW: "bg-indigo-100 text-indigo-700",
  HR_VERIFIED: "bg-teal-100 text-teal-700",
  RETURNED_TO_HOD: "bg-amber-100 text-amber-700",
  PENDING_AUTHORIZATION: "bg-teal-100 text-teal-700",
  APPROVED: "bg-green-100 text-green-700",
  DENIED: "bg-red-100 text-red-700",
  PDF_GENERATED: "bg-green-100 text-green-700",
  COMPLETED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
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

// Colors the "Current Location" chip by who currently owns the application
// (see backend LeaveApplication.current_location) — action-required states
// get the same amber treatment as their non-action counterparts so the
// pattern reads consistently, but "Completed" gets a neutral/settled color.
function locationStyle(location: string): string {
  if (location.startsWith("Employee")) return "bg-amber-100 text-amber-700";
  if (location === "Completed") return "bg-gray-100 text-gray-600";
  if (location.startsWith("HOD")) return "bg-blue-100 text-blue-700";
  if (location.startsWith("CAG")) return "bg-purple-100 text-purple-700";
  if (location.startsWith("HR")) return "bg-indigo-100 text-indigo-700";
  if (location.startsWith("Authorizing Officer")) return "bg-teal-100 text-teal-700";
  return "bg-gray-100 text-gray-700";
}

export function LocationBadge({ location }: { location: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", locationStyle(location))}>
      {location}
    </span>
  );
}
