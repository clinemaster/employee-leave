"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { SectionA, SectionB1ReadOnly, SectionB2ReadOnly, SectionCReadOnly } from "@/components/leave/SectionReadOnly";
import { Button } from "@/components/ui/Button";
import { useGetLeaveApplicationQuery, useGenerateLeavePdfMutation } from "@/features/leave/leaveApi";

export default function EmployeeApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const applicationId = Number(id);
  const { data: application, isLoading } = useGetLeaveApplicationQuery(applicationId);
  const [generatePdf, { isLoading: isGenerating }] = useGenerateLeavePdfMutation();

  async function handleDownload() {
    const result = await generatePdf({ id: applicationId }).unwrap();
    window.open(result.file, "_blank");
  }

  // Per API.md, PDF generation is only permitted once status is APPROVED.
  const canGeneratePdf = application?.status === "APPROVED" || application?.status === "PDF_GENERATED";

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Application #{applicationId}</h1>
        <Button variant="secondary" onClick={handleDownload} disabled={isGenerating || !canGeneratePdf}>
          Download PDF
        </Button>
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
