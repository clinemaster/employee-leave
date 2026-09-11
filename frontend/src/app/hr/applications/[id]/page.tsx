"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { SectionA, SectionB1ReadOnly } from "@/components/leave/SectionReadOnly";
import { HrReviewForm } from "@/components/workflow/HrReviewForm";
import { LeaveBalances } from "@/components/leave/LeaveBalances";
import { TravelPaymentPreview } from "@/components/leave/TravelPaymentPreview";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useGetLeaveApplicationQuery } from "@/features/leave/leaveApi";

export default function HrApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const applicationId = Number(id);
  const { data: application, isLoading } = useGetLeaveApplicationQuery(applicationId);

  const hasTravelPaymentData =
    !!application &&
    (application.travel_routes.length > 0 ||
      application.taxi_expenses.length > 0 ||
      application.mizigo_items.length > 0);

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Review Application #{applicationId}</h1>
      {isLoading || !application ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <SectionA application={application} />
          <SectionB1ReadOnly application={application} />
          {hasTravelPaymentData ? (
            <Card>
              <CardHeader>
                <CardTitle>Travel Payment Request — JEDWALI 1</CardTitle>
              </CardHeader>
              <TravelPaymentPreview
                routes={application.travel_routes}
                taxi={application.taxi_expenses}
                mizigo={application.mizigo_items}
              />
            </Card>
          ) : null}
          <LeaveBalances employeeId={application.employee} title="Applicant Leave Balances" />
          <HrReviewForm applicationId={applicationId} />
        </div>
      )}
    </AppShell>
  );
}
