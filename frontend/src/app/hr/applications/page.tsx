"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";
import { Input } from "@/components/ui/Input";

export default function HrApplicationsPage() {
  const [search, setSearch] = useState("");

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">HR — Applications</h1>
        <div className="w-64">
          <Input placeholder="Search applicant..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <TabbedApplications
        detailBasePath="/hr/applications"
        tabs={[
          { label: "Pending Verification", status: "PENDING_HR_REVIEW" },
          { label: "Verified", status: "HR_VERIFIED" },
          { label: "Returned", status: "RETURNED_TO_HOD" },
          { label: "Completed", status: "APPROVED" },
        ]}
      />
    </AppShell>
  );
}
