"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { LeaveApplicationForm } from "@/components/leave/LeaveApplicationForm";

export default function NewLeaveApplicationPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">New Leave Application</h1>
      <LeaveApplicationForm />
    </AppShell>
  );
}
