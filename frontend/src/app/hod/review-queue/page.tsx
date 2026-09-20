"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { ReviewQueue } from "@/components/dashboard/ReviewQueue";

export default function HodReviewQueuePage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">HOD — Review Queue</h1>
      <ReviewQueue detailBasePath="/hod/applications" unattendedStatuses={["PENDING_HOD_REVIEW"]} />
    </AppShell>
  );
}
