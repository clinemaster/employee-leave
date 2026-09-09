"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useApproveLeaveApplicationMutation, useDenyLeaveApplicationMutation } from "@/features/leave/leaveApi";

// Section C — AUTHORIZING_OFFICER. POST .../approve/ or .../deny/ with
// comments, signature_name/designation. A reason (comments) is required to
// deny. Travel assistance is requested by the applicant in Section A
// (`travel_assistance`, shown read-only above) — API.md does not document a
// separate travel-assistance decision field on Section C.
export function ApprovalForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [approve, { isLoading: isApproving }] = useApproveLeaveApplicationMutation();
  const [deny, { isLoading: isDenying }] = useDenyLeaveApplicationMutation();
  const [signatureName, setSignatureName] = useState("");
  const [signatureDesignation, setSignatureDesignation] = useState("");
  const [comments, setComments] = useState("");
  const [denyReason, setDenyReason] = useState("");

  async function onApprove() {
    await approve({
      id: applicationId,
      comments,
      signature_name: signatureName,
      signature_designation: signatureDesignation,
    }).unwrap();
    router.push("/authorization/applications");
  }

  async function onDeny() {
    if (!denyReason.trim()) return;
    await deny({
      id: applicationId,
      comments: denyReason,
      signature_name: signatureName,
      signature_designation: signatureDesignation,
    }).unwrap();
    router.push("/authorization/applications");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section C — Authorization</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="signatureName">Name</Label>
            <Input id="signatureName" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="signatureDesignation">Designation</Label>
            <Input
              id="signatureDesignation"
              value={signatureDesignation}
              onChange={(e) => setSignatureDesignation(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="comments">Comments (approval)</Label>
          <textarea
            id="comments"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>
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
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
        />
        <Button variant="danger" className="mt-2" disabled={isDenying || !denyReason.trim()} onClick={onDeny}>
          Deny
        </Button>
      </div>
    </Card>
  );
}
