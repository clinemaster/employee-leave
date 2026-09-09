"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { useApproveLeaveApplicationMutation, useDenyLeaveApplicationMutation } from "@/features/leave/leaveApi";

export function ApprovalForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [approve, { isLoading: isApproving }] = useApproveLeaveApplicationMutation();
  const [deny, { isLoading: isDenying }] = useDenyLeaveApplicationMutation();
  const [travelAssistance, setTravelAssistance] = useState(false);
  const [reason, setReason] = useState("");

  async function onApprove() {
    await approve({ id: applicationId, decision: "APPROVE", travelAssistance }).unwrap();
    router.push("/authorization/applications");
  }

  async function onDeny() {
    if (!reason.trim()) return;
    await deny({ id: applicationId, decision: "DENY", reason }).unwrap();
    router.push("/authorization/applications");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section C — Authorization</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={travelAssistance} onChange={(e) => setTravelAssistance(e.target.checked)} />
          Grant travel assistance
        </label>
        <Button onClick={onApprove} disabled={isApproving}>
          Approve
        </Button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <Label htmlFor="denyReason">Reason for Denial (required to deny)</Label>
        <textarea
          id="denyReason"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button variant="danger" className="mt-2" disabled={isDenying || !reason.trim()} onClick={onDeny}>
          Deny
        </Button>
      </div>
    </Card>
  );
}
