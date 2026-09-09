"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useVerifyLeaveApplicationMutation, useReturnLeaveApplicationMutation } from "@/features/leave/leaveApi";

// Section B2 — HR_ADMIN. POST .../verify/ with decision: true/false, comments,
// signature_name/designation.
export function HrReviewForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [verify, { isLoading: isVerifying }] = useVerifyLeaveApplicationMutation();
  const [returnApp, { isLoading: isReturning }] = useReturnLeaveApplicationMutation();
  const [verified, setVerified] = useState(true);
  const [comments, setComments] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signatureDesignation, setSignatureDesignation] = useState("");
  const [returnComments, setReturnComments] = useState("");

  async function onVerify() {
    await verify({
      id: applicationId,
      decision: verified,
      comments,
      signature_name: signatureName,
      signature_designation: signatureDesignation,
    }).unwrap();
    router.push("/hr/applications");
  }

  async function onReturn() {
    if (!returnComments.trim()) return;
    await returnApp({ id: applicationId, comments: returnComments }).unwrap();
    router.push("/hr/applications");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B2 — HR Review</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <div>
          <Label htmlFor="verified">Verification</Label>
          <select
            id="verified"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={verified ? "yes" : "no"}
            onChange={(e) => setVerified(e.target.value === "yes")}
          >
            <option value="yes">Verified</option>
            <option value="no">Not verified</option>
          </select>
        </div>
        <div>
          <Label htmlFor="hrComments">HR Comments</Label>
          <textarea
            id="hrComments"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>
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
        <Button onClick={onVerify} disabled={isVerifying}>
          Submit
        </Button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <Label htmlFor="hrReturnComments">Return to Line Manager (with comments)</Label>
        <textarea
          id="hrReturnComments"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={returnComments}
          onChange={(e) => setReturnComments(e.target.value)}
        />
        <Button variant="danger" className="mt-2" disabled={isReturning || !returnComments.trim()} onClick={onReturn}>
          Return
        </Button>
      </div>
    </Card>
  );
}
