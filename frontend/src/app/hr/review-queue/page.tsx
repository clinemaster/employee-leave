"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { ReviewQueue } from "@/components/dashboard/ReviewQueue";

export default function HrReviewQueuePage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">HR — Review Queue</h1>
      <ReviewQueue detailBasePath="/hr/applications" unattendedStatuses={["PENDING_HR_REVIEW"]} />
    </AppShell>
  );
}
