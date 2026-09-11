"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useVerifyLeaveApplicationMutation } from "@/features/leave/leaveApi";
import { extractErrorMessage } from "@/lib/api/errors";
import { hrReviewSchema, type HrReviewFormValues } from "@/lib/validation/leaveApplication";

// Section B2 — HR_ADMIN. POST .../verify/ with decision: true/false, comments,
// signature_name/designation. NOTE: /API.md documents `.../return/` as
// HOD/HOS/HOU-only (from PENDING_HOD_REVIEW); an HR "return to line
// manager" action (RETURNED_TO_HOD) is listed in the status enum but has no
// REST action wired up yet ("Deferred" section of API.md) — so no return
// button is offered here until backend exposes it. HR can still verify with
// decision: false to flag an issue via comments.
export function HrReviewForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [verify, { isLoading: isVerifying }] = useVerifyLeaveApplicationMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HrReviewFormValues>({
    resolver: zodResolver(hrReviewSchema),
    defaultValues: { decision: true, comments: "", signature_name: "", signature_designation: "" },
  });

  async function onVerify(values: HrReviewFormValues) {
    setActionError(null);
    try {
      await verify({
        id: applicationId,
        decision: values.decision,
        comments: values.comments,
        signature_name: values.signature_name,
        signature_designation: values.signature_designation,
      }).unwrap();
      router.push("/hr/applications");
    } catch (err) {
      setActionError(extractErrorMessage(err, "Failed to submit HR review. Please try again."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B2 — HR Review</CardTitle>
      </CardHeader>
      {actionError ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
      <form className="space-y-4" onSubmit={handleSubmit(onVerify)}>
        <div>
          <Label htmlFor="verified">Verification</Label>
          <select
            id="verified"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("decision", { setValueAs: (v) => v === "yes" })}
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
            {...register("comments")}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="signatureName">Name</Label>
            <Input id="signatureName" error={errors.signature_name?.message} {...register("signature_name")} />
          </div>
          <div>
            <Label htmlFor="signatureDesignation">Designation</Label>
            <Input
              id="signatureDesignation"
              error={errors.signature_designation?.message}
              {...register("signature_designation")}
            />
          </div>
        </div>
        <Button type="submit" disabled={isVerifying}>
          Submit
        </Button>
      </form>
    </Card>
  );
}
