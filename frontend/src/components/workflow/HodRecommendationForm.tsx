"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useRecommendLeaveApplicationMutation, useReturnLeaveApplicationMutation } from "@/features/leave/leaveApi";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  hodRecommendationSchema,
  hodReturnSchema,
  type HodRecommendationFormValues,
  type HodReturnFormValues,
} from "@/lib/validation/leaveApplication";

// Section B1 — HOD/HOS/HOU. POST .../recommend/ with decision: true/false,
// comments (required unless plainly recommending), signature_name/designation.
export function HodRecommendationForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [recommend, { isLoading: isRecommending }] = useRecommendLeaveApplicationMutation();
  const [returnApp, { isLoading: isReturning }] = useReturnLeaveApplicationMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<HodRecommendationFormValues>({
    resolver: zodResolver(hodRecommendationSchema),
    defaultValues: { decision: true, comments: "", signature_name: "", signature_designation: "" },
  });
  const decision = watch("decision");

  const {
    register: registerReturn,
    handleSubmit: handleReturnSubmit,
    formState: { errors: returnErrors },
  } = useForm<HodReturnFormValues>({
    resolver: zodResolver(hodReturnSchema),
    defaultValues: { comments: "" },
  });

  async function onSubmit(values: HodRecommendationFormValues) {
    setActionError(null);
    try {
      await recommend({
        id: applicationId,
        decision: values.decision,
        comments: values.comments,
        signature_name: values.signature_name,
        signature_designation: values.signature_designation,
      }).unwrap();
      router.push("/hod/applications");
    } catch (err) {
      setActionError(extractErrorMessage(err, "Failed to submit recommendation. Please try again."));
    }
  }

  async function onReturn(values: HodReturnFormValues) {
    setActionError(null);
    try {
      await returnApp({ id: applicationId, comments: values.comments }).unwrap();
      router.push("/hod/applications");
    } catch (err) {
      setActionError(extractErrorMessage(err, "Failed to return application. Please try again."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section B1 — Recommendation</CardTitle>
      </CardHeader>
      {actionError ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <Label htmlFor="decision">Recommendation</Label>
          <select
            id="decision"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("decision", { setValueAs: (v) => v === "yes" })}
          >
            <option value="yes">Recommend</option>
            <option value="no">Do not recommend</option>
          </select>
        </div>
        <div>
          <Label htmlFor="comments">Comments {!decision ? "(required)" : ""}</Label>
          <textarea
            id="comments"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("comments")}
          />
          {errors.comments ? <p className="mt-1 text-xs text-red-600">{errors.comments.message}</p> : null}
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
        <Button type="submit" disabled={isRecommending}>
          Submit Recommendation
        </Button>
      </form>

      <form className="mt-6 border-t border-gray-100 pt-4" onSubmit={handleReturnSubmit(onReturn)}>
        <Label htmlFor="returnComments">Return to Applicant (with comments)</Label>
        <textarea
          id="returnComments"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...registerReturn("comments")}
        />
        {returnErrors.comments ? <p className="mt-1 text-xs text-red-600">{returnErrors.comments.message}</p> : null}
        <Button type="submit" variant="danger" className="mt-2" disabled={isReturning}>
          Return
        </Button>
      </form>
    </Card>
  );
}
