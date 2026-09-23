import clsx from "clsx";
import { LocationBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useGetLeaveAuditTrailQuery } from "@/features/leave/leaveApi";
import type { LeaveApplication } from "@/types";

const HOD_STAGES = ["Employee", "HOD", "HR", "Authorizing Officer", "Completed"] as const;
// Applicants whose role requires CAG review (see LeaveApplication.
// requires_cag_review) skip the HOD stage entirely — CAG stands in for it.
const CAG_STAGES = ["Employee", "CAG", "HR", "Authorizing Officer", "Completed"] as const;
// Division employees whose role doesn't itself require CAG review (see
// LeaveApplication.requires_aag_review) skip the HOD stage too — AAG stands
// in for it instead.
const AAG_STAGES = ["Employee", "AAG", "HR", "Authorizing Officer", "Completed"] as const;
// Employees whose only org assignment is a work station (see
// LeaveApplication.requires_cea_review) skip the HOD stage too — the
// CHIEF_EXTERNAL_AUDITOR at their work station stands in for it instead.
const CEA_STAGES = ["Employee", "CEA", "HR", "Authorizing Officer", "Completed"] as const;

// Which stepper stage a `current_location` value belongs to — locations like
// "Employee — Action Required" or "HOD — Action Required" still map to their
// base stage, just rendered as the active (not yet completed) one.
function stageIndex(stages: readonly string[], location: string): number {
  const base = location.split(" — ")[0];
  const idx = stages.indexOf(base);
  return idx === -1 ? 0 : idx;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkflowStatusCard({ application }: { application: LeaveApplication }) {
  const location = application.current_location ?? "-";
  const statusLabel = application.current_status_label ?? application.status;
  const STAGES = application.requires_cag_review
    ? CAG_STAGES
    : application.requires_aag_review
      ? AAG_STAGES
      : application.requires_cea_review
        ? CEA_STAGES
        : HOD_STAGES;
  const activeIndex = stageIndex(STAGES, location);
  const isTerminal = location === "Completed";

  return (
    <Card>
      <div className="mb-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current Status</p>
        <p className="mt-1 text-lg font-bold text-gray-900">{statusLabel.toUpperCase()}</p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Current Location</p>
        <div className="mt-1 flex justify-center">
          <LocationBadge location={location} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Last Updated {formatDateTime(application.updated_at)}
        </p>
      </div>

      <div className="mt-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Workflow Progress</p>
        <ol className="flex flex-col gap-1">
          {STAGES.map((stage, index) => {
            const done = isTerminal ? true : index < activeIndex;
            const active = !isTerminal && index === activeIndex;
            return (
              <li key={stage} className="flex items-center gap-2">
                <span
                  className={clsx(
                    "flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px]",
                    done
                      ? "border-green-600 bg-green-600 text-white"
                      : active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-gray-400"
                  )}
                >
                  {done ? "✓" : active ? "●" : "○"}
                </span>
                <span className={clsx("text-sm", active ? "font-semibold text-gray-900" : "text-gray-600")}>
                  {stage}
                  {active && stage !== "Completed" ? (
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      {location.includes("Action Required") ? "— action required" : "— currently reviewing"}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

export function WorkflowHistoryCard({ applicationId }: { applicationId: number }) {
  const { data: entries, isLoading } = useGetLeaveAuditTrailQuery(applicationId);

  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-gray-900">Workflow History</p>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-sm text-gray-500">No workflow activity yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 border-gray-200 pl-3">
              <p className="text-sm text-gray-900">
                <span className="font-medium">{entry.previous_location ?? "—"}</span>
                {" → "}
                <span className="font-medium">{entry.new_location ?? entry.new_status}</span>
              </p>
              <p className="text-xs text-gray-500">
                {entry.action.replaceAll("_", " ")} by {entry.user_name || "System"} ({entry.role.replaceAll("_", " ")})
                {" · "}
                {formatDateTime(entry.timestamp)}
              </p>
              {entry.comments ? <p className="mt-1 text-xs text-gray-600">"{entry.comments}"</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
