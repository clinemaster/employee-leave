"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";

export default function CagApplicationsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">CAG — Review Queue</h1>
      <TabbedApplications
        detailBasePath="/cag/applications"
        tabs={[
          { label: "Pending Review", status: "PENDING_CAG_REVIEW" },
          { label: "Recommended", status: "CAG_RECOMMENDED" },
          { label: "Rejected", status: "DENIED" },
        ]}
        unattendedStatuses={["PENDING_CAG_REVIEW"]}
      />
    </AppShell>
  );
}
