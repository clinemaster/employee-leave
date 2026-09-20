import type { LeaveApplication } from "@/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

function Row({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="flex justify-between border-b border-gray-100 py-1.5 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{display ?? "-"}</span>
    </div>
  );
}

export function SectionA({ application }: { application: LeaveApplication }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section A — Applicant Details</CardTitle>
      </CardHeader>
      <Row label="Full Name" value={application.full_name} />
      <Row label="Designation" value={application.designation} />
      <Row label="Station" value={application.station} />
      <Row label="Division / Department" value={application.division_department} />
      <Row label="Check Number" value={application.check_number} />
      <Row label="Personnel File" value={application.personnel_file} />
      <Row label="Vote Code / Sub Vote" value={[application.vote_code, application.sub_vote].filter(Boolean).join(" / ")} />
      <Row label="Leave Type" value={application.leave_type_name} />
      <Row label="Leave Number" value={application.leave_number} />
      <Row label="Dates" value={`${application.start_date} to ${application.last_date}`} />
      <Row label="Working Days (preview)" value={application.working_days_preview ?? application.total_working_days} />
      <Row label="Travel Assistance Requested" value={application.travel_assistance} />
      <Row label="Contact Address" value={application.contact_address} />
      <Row label="Phone" value={application.phone_number} />
      <Row label="Email" value={application.email} />
      <Row
        label="Dependants"
        value={application.dependants.map((d) => d.name).join(", ") || "None"}
      />
    </Card>
  );
}

export function SectionB1ReadOnly({ application }: { application: LeaveApplication }) {
  const rec = application.recommendation;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B1 — Line Manager Recommendation</CardTitle>
      </CardHeader>
      {rec ? (
        <>
          <Row label="Recommended" value={rec.recommended} />
          <Row label="Comments" value={rec.comments} />
          <Row label="Signed By" value={rec.signature_name} />
          <Row label="Designation" value={rec.signature_designation} />
          <Row label="Date" value={rec.created_at} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Not yet reviewed.</p>
      )}
    </Card>
  );
}

// Shown in place of SectionB1ReadOnly for applicants whose role requires CAG
// review (application.requires_cag_review) — CAG stands in for the line-
// manager stage for these applicants, so this is what carries their
// comments forward to HR/the Authorizing Officer/the employee's own view.
export function SectionCAGReadOnly({ application }: { application: LeaveApplication }) {
  const cag = application.cag_review;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B1 — CAG Review</CardTitle>
      </CardHeader>
      {cag ? (
        <>
          <Row label="Recommended" value={cag.recommended} />
          <Row label="Comments" value={cag.comments} />
          <Row label="Signed By" value={cag.signature_name} />
          <Row label="Designation" value={cag.signature_designation} />
          <Row label="Date" value={cag.created_at} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Not yet reviewed by CAG.</p>
      )}
    </Card>
  );
}

// Shown in place of SectionB1ReadOnly for Division employees whose role
// doesn't itself require CAG review (application.requires_aag_review) — AAG
// stands in for the line-manager stage for these employees, so this is what
// carries their comments forward to HR/the Authorizing Officer/the
// employee's own view.
export function SectionAAGReadOnly({ application }: { application: LeaveApplication }) {
  const aag = application.aag_review;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B1 — AAG Review</CardTitle>
      </CardHeader>
      {aag ? (
        <>
          <Row label="Recommended" value={aag.recommended} />
          <Row label="Comments" value={aag.comments} />
          <Row label="Signed By" value={aag.signature_name} />
          <Row label="Designation" value={aag.signature_designation} />
          <Row label="Date" value={aag.created_at} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Not yet reviewed by AAG.</p>
      )}
    </Card>
  );
}

export function SectionB2ReadOnly({ application }: { application: LeaveApplication }) {
  const hr = application.hr_review;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B2 — HR Review</CardTitle>
      </CardHeader>
      {hr ? (
        <>
          <Row label="Verified" value={hr.verified} />
          <Row label="HR Comments" value={hr.comments} />
          <Row label="Signed By" value={hr.signature_name} />
          <Row label="Designation" value={hr.signature_designation} />
          <Row label="Date" value={hr.created_at} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Not yet reviewed by HR.</p>
      )}
    </Card>
  );
}

export function SectionCReadOnly({ application }: { application: LeaveApplication }) {
  const approval = application.approval;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section C — Authorization</CardTitle>
      </CardHeader>
      {approval ? (
        <>
          <Row label="Approved" value={approval.approved} />
          <Row label="Comments" value={approval.comments} />
          <Row label="Signed By" value={approval.signature_name} />
          <Row label="Designation" value={approval.signature_designation} />
          <Row label="Date" value={approval.created_at} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Not yet decided.</p>
      )}
    </Card>
  );
}
