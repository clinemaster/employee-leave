"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { SectionA, SectionB1ReadOnly } from "@/components/leave/SectionReadOnly";
import { HrReviewForm } from "@/components/workflow/HrReviewForm";
import { LeaveBalances } from "@/components/leave/LeaveBalances";
import { useGetLeaveApplicationQuery } from "@/features/leave/leaveApi";

export default function HrApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const applicationId = Number(id);
  const { data: application, isLoading } = useGetLeaveApplicationQuery(applicationId);

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Review Application #{applicationId}</h1>
      {isLoading || !application ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <SectionA application={application} />
          <SectionB1ReadOnly application={application} />
          <LeaveBalances employeeId={application.employee} title="Applicant Leave Balances" />
          <HrReviewForm applicationId={applicationId} />
        </div>
      )}
    </AppShell>
  );
}
