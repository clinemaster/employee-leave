"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { ReviewQueue } from "@/components/dashboard/ReviewQueue";

export default function AuthorizationReviewQueuePage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Authorizing Officer — Review Queue</h1>
      <ReviewQueue detailBasePath="/authorization/applications" unattendedStatuses={["PENDING_AUTHORIZATION"]} />
    </AppShell>
  );
}
