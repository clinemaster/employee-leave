"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";

export default function HodApplicationsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">HOD — Applications</h1>
      <DashboardStats />
      <TabbedApplications
        detailBasePath="/hod/applications"
        tabs={[
          { label: "Pending Recommendation", status: "PENDING_HOD_REVIEW" },
          { label: "Recommended", status: "HOD_RECOMMENDED" },
          { label: "Returned", status: "RETURNED_TO_EMPLOYEE" },
          { label: "Completed", status: "APPROVED" },
        ]}
      />
    </AppShell>
  );
}
