"use client";

import { use } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import {
  SectionA, SectionAAGReadOnly, SectionB1ReadOnly, SectionB2ReadOnly, SectionCAGReadOnly,
} from "@/components/leave/SectionReadOnly";
import { DownloadPdfButton } from "@/components/leave/DownloadPdfButton";
import { ApprovalForm } from "@/components/workflow/ApprovalForm";
import { TravelPaymentPreview } from "@/components/leave/TravelPaymentPreview";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useGetLeaveApplicationQuery } from "@/features/leave/leaveApi";

export default function AuthorizationApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Review Application #{applicationId}</h1>
        <DownloadPdfButton applicationId={applicationId} status={application?.status} />
      </div>
      {isLoading || !application ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <SectionA application={application} />
          {application.requires_cag_review ? (
            <SectionCAGReadOnly application={application} />
          ) : application.requires_aag_review ? (
            <SectionAAGReadOnly application={application} />
          ) : (
            <SectionB1ReadOnly application={application} />
          )}
          <SectionB2ReadOnly application={application} />
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
          <ApprovalForm applicationId={applicationId} />
        </div>
      )}
    </AppShell>
  );
}
