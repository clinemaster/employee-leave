"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";

export default function AagApplicationsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">AAG — Review Queue</h1>
      <TabbedApplications
        detailBasePath="/aag/applications"
        tabs={[
          { label: "Pending Review", status: "PENDING_AAG_REVIEW" },
          { label: "Recommended", status: "AAG_RECOMMENDED" },
          { label: "Rejected", status: "DENIED" },
        ]}
      />
    </AppShell>
  );
}
