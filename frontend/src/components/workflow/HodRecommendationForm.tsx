"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useRecommendLeaveApplicationMutation, useReturnLeaveApplicationMutation } from "@/features/leave/leaveApi";

// Section B1 — HOD/HOS/HOU. POST .../recommend/ with decision: true/false,
// comments (required unless plainly recommending), signature_name/designation.
export function HodRecommendationForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [recommend, { isLoading: isRecommending }] = useRecommendLeaveApplicationMutation();
  const [returnApp, { isLoading: isReturning }] = useReturnLeaveApplicationMutation();
  const [recommended, setRecommended] = useState(true);
  const [comments, setComments] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [signatureDesignation, setSignatureDesignation] = useState("");
  const [returnComments, setReturnComments] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!recommended && !comments.trim()) {
      setError("Comments are required when not recommending.");
      return;
    }
    await recommend({
      id: applicationId,
      decision: recommended,
      comments,
      signature_name: signatureName,
      signature_designation: signatureDesignation,
    }).unwrap();
    router.push("/hod/applications");
  }

  async function onReturn() {
    if (!returnComments.trim()) return;
    await returnApp({ id: applicationId, comments: returnComments }).unwrap();
    router.push("/hod/applications");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B1 — Recommendation</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <div>
          <Label htmlFor="decision">Recommendation</Label>
          <select
            id="decision"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={recommended ? "yes" : "no"}
            onChange={(e) => setRecommended(e.target.value === "yes")}
          >
            <option value="yes">Recommend</option>
            <option value="no">Do not recommend</option>
          </select>
        </div>
        <div>
          <Label htmlFor="comments">Comments {!recommended ? "(required)" : ""}</Label>
          <textarea
            id="comments"
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={onSubmit} disabled={isRecommending}>
          Submit Recommendation
        </Button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <Label htmlFor="returnComments">Return to Applicant (with comments)</Label>
        <textarea
          id="returnComments"
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
