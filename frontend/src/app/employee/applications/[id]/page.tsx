"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { SectionA, SectionB1ReadOnly, SectionB2ReadOnly, SectionCReadOnly } from "@/components/leave/SectionReadOnly";
import { Button } from "@/components/ui/Button";
import {
  useGetLeaveApplicationQuery,
  useGenerateLeavePdfMutation,
  useLazyGetLeaveDocumentsQuery,
} from "@/features/leave/leaveApi";

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "detail" in data && typeof (data as { detail?: unknown }).detail === "string") {
      return (data as { detail: string }).detail;
    }
  }
  return "Something went wrong. Please try again.";
}

export default function EmployeeApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const applicationId = Number(id);
  const { data: application, isLoading } = useGetLeaveApplicationQuery(applicationId);
  const [generatePdf, { isLoading: isGenerating }] = useGenerateLeavePdfMutation();
  const [fetchDocuments, { isFetching: isFetchingDocuments }] = useLazyGetLeaveDocumentsQuery();
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    try {
      if (application?.status === "APPROVED") {
        const result = await generatePdf({ id: applicationId }).unwrap();
        window.open(result.file, "_blank");
        return;
      }
      // Already generated (or later stage) — fetch the existing document
      // instead of asking the backend to regenerate it, which the workflow
      // correctly rejects once status has moved past APPROVED.
      const documents = await fetchDocuments(applicationId).unwrap();
      const latest = documents[0];
      if (!latest) {
        setError("No PDF has been generated for this application yet.");
        return;
      }
      window.open(latest.file, "_blank");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  const canDownload =
    application?.status === "APPROVED" ||
    application?.status === "PDF_GENERATED" ||
    application?.status === "COMPLETED" ||
    application?.status === "ARCHIVED";

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Application #{applicationId}</h1>
        <Button
          variant="secondary"
          onClick={handleDownload}
          disabled={isGenerating || isFetchingDocuments || !canDownload}
        >
          Download PDF
        </Button>
      </div>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
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
