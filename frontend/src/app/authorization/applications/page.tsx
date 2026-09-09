"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";

export default function AuthorizationApplicationsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Authorizing Officer — Applications</h1>
      <DashboardStats />
      <TabbedApplications
        detailBasePath="/authorization/applications"
        tabs={[
          { label: "Pending Decision", status: "PENDING_AUTHORIZATION" },
          { label: "Approved", status: "APPROVED" },
          { label: "Denied", status: "DENIED" },
        ]}
      />
    </AppShell>
  );
}
