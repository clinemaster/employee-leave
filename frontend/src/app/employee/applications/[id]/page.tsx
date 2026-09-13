"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { SectionA, SectionB1ReadOnly, SectionB2ReadOnly, SectionCReadOnly } from "@/components/leave/SectionReadOnly";
import { DownloadPdfButton } from "@/components/leave/DownloadPdfButton";
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
          <SectionA application={application} />
          <SectionB1ReadOnly application={application} />
          <SectionB2ReadOnly application={application} />
          <SectionCReadOnly application={application} />
        </div>
      )}
    </AppShell>
  );
}
