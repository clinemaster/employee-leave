"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useVerifyLeaveApplicationMutation } from "@/features/leave/leaveApi";

// Section B2 — HR_ADMIN. POST .../verify/ with decision: true/false, comments,
// signature_name/designation. NOTE: /API.md documents `.../return/` as
// HOD/HOS/HOU-only (from PENDING_HOD_REVIEW); an HR "return to line manager"
// action (RETURNED_TO_HOD) is listed in the status enum but has no REST
// action wired up yet ("Deferred" section of API.md) — so no return button
// is offered here until backend exposes it. HR can still verify with
// decision: false to flag an issue via comments.
export function HrReviewForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [verify, { isLoading: isVerifying }] = useVerifyLeaveApplicationMutation();
  const [verified, setVerified] = useState(true);
  const [comments, setComments] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signatureDesignation, setSignatureDesignation] = useState("");

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
    </Card>
  );
}
