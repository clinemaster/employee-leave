"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import {
  SectionA, SectionAAGReadOnly, SectionB1ReadOnly, SectionB2ReadOnly, SectionCAGReadOnly,
  SectionCReadOnly,
} from "@/components/leave/SectionReadOnly";
import { DownloadPdfButton } from "@/components/leave/DownloadPdfButton";
import { WorkflowHistoryCard, WorkflowStatusCard } from "@/components/leave/WorkflowStatus";
import { useGetLeaveApplicationQuery } from "@/features/leave/leaveApi";

export default function EmployeeApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const applicationId = Number(id);
  const { data: application, isLoading } = useGetLeaveApplicationQuery(applicationId);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Application #{applicationId}</h1>
        <DownloadPdfButton applicationId={applicationId} status={application?.status} />
      </div>
      {isLoading || !application ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <WorkflowStatusCard application={application} />
          <SectionA application={application} />
          {application.requires_cag_review ? (
            <SectionCAGReadOnly application={application} />
          ) : application.requires_aag_review ? (
            <SectionAAGReadOnly application={application} />
          ) : (
            <SectionB1ReadOnly application={application} />
          )}
          <SectionB2ReadOnly application={application} />
          <SectionCReadOnly application={application} />
          <WorkflowHistoryCard applicationId={applicationId} />
        </div>
      )}
    </AppShell>
  );
}
