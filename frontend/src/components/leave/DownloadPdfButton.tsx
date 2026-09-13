"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  useGenerateLeavePdfMutation,
  useLazyGetLeaveDocumentsQuery,
} from "@/features/leave/leaveApi";
import { extractErrorMessage } from "@/lib/api/errors";
import type { LeaveStatus } from "@/types";

export function isPdfDownloadable(status?: LeaveStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "PDF_GENERATED" ||
    status === "COMPLETED" ||
    status === "ARCHIVED"
  );
}

// Once an application is APPROVED (or later: PDF_GENERATED/COMPLETED/
// ARCHIVED), both the applicant and HR Admin (and the Authorizing Officer)
// may fetch the approved PDF — the backend already allows all three
// (see apps/leave/workflow.py's generate_pdf role check). Whoever asks
// first generates it (the workflow only allows that transition once, from
// APPROVED); everyone else after that just downloads the already-generated
// document instead of asking the backend to regenerate it, which the
// workflow correctly rejects once status has moved past APPROVED.
export function DownloadPdfButton({
  applicationId,
  status,
}: {
  applicationId: number;
  status?: LeaveStatus;
}) {
  const [generatePdf, { isLoading: isGenerating }] = useGenerateLeavePdfMutation();
  const [fetchDocuments, { isFetching: isFetchingDocuments }] = useLazyGetLeaveDocumentsQuery();
  const [error, setError] = useState<string | null>(null);

  const canDownload = isPdfDownloadable(status);

  async function handleDownload() {
    setError(null);
    try {
      if (status === "APPROVED") {
        const result = await generatePdf({ id: applicationId }).unwrap();
        window.open(result.file, "_blank");
        return;
      }
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

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={handleDownload}
        disabled={isGenerating || isFetchingDocuments || !canDownload}
      >
        Download PDF
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
