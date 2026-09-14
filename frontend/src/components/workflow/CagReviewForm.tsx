"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useCagReviewLeaveApplicationMutation, useCagRejectLeaveApplicationMutation } from "@/features/leave/leaveApi";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  cagRejectSchema, cagReviewSchema, type CagRejectFormValues, type CagReviewFormValues,
} from "@/lib/validation/leaveApplication";

// CAG review — mandatory stand-in for Section B1 for applicants whose role
// requires it (AUTHORIZING_OFFICER, HEAD_OF_DEPARTMENT,
// HEAD_OF_SUPPORT_DIVISION, HEAD_OF_DIVISION — see
// LeaveApplication.requires_cag_review). POST .../cag-review/ recommends and
// auto-routes straight to HR (no HOD stage in this track); POST
// .../cag-reject/ is terminal and requires a reason.
export function CagReviewForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [cagReview, { isLoading: isRecommending }] = useCagReviewLeaveApplicationMutation();
  const [cagReject, { isLoading: isRejecting }] = useCagRejectLeaveApplicationMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    register: registerRecommend,
    handleSubmit: handleRecommendSubmit,
    formState: { errors: recommendErrors },
  } = useForm<CagReviewFormValues>({
    resolver: zodResolver(cagReviewSchema),
    defaultValues: { comments: "", signature_name: "", signature_designation: "" },
  });

  const {
    register: registerReject,
    handleSubmit: handleRejectSubmit,
    formState: { errors: rejectErrors },
  } = useForm<CagRejectFormValues>({
    resolver: zodResolver(cagRejectSchema),
    defaultValues: { comments: "" },
  });

  async function onRecommend(values: CagReviewFormValues) {
    setActionError(null);
    try {
      await cagReview({
        id: applicationId,
        decision: true,
        comments: values.comments,
        signature_name: values.signature_name,
        signature_designation: values.signature_designation,
      }).unwrap();
      router.push("/cag/applications");
    } catch (err) {
      setActionError(extractErrorMessage(err, "Failed to submit recommendation. Please try again."));
    }
  }

  async function onReject(values: CagRejectFormValues) {
    setActionError(null);
    try {
      await cagReject({ id: applicationId, comments: values.comments }).unwrap();
      router.push("/cag/applications");
    } catch (err) {
      setActionError(extractErrorMessage(err, "Failed to reject application. Please try again."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CAG Review</CardTitle>
      </CardHeader>
      {actionError ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
      <form className="space-y-4" onSubmit={handleRecommendSubmit(onRecommend)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="signatureName">Name</Label>
            <Input id="signatureName" error={recommendErrors.signature_name?.message} {...registerRecommend("signature_name")} />
          </div>
          <div>
            <Label htmlFor="signatureDesignation">Designation</Label>
            <Input
              id="signatureDesignation"
              error={recommendErrors.signature_designation?.message}
              {...registerRecommend("signature_designation")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="comments">Comments (recommendation)</Label>
          <textarea
            id="comments"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...registerRecommend("comments")}
          />
        </div>
        <Button type="submit" disabled={isRecommending}>
          Recommend
        </Button>
      </form>

      <form className="mt-6 border-t border-gray-100 pt-4" onSubmit={handleRejectSubmit(onReject)}>
        <Label htmlFor="rejectReason">Reason for Rejection (required to reject)</Label>
        <textarea
          id="rejectReason"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...registerReject("comments")}
        />
        {rejectErrors.comments ? <p className="mt-1 text-xs text-red-600">{rejectErrors.comments.message}</p> : null}
        <Button type="submit" variant="danger" className="mt-2" disabled={isRejecting}>
          Reject
        </Button>
      </form>
    </Card>
  );
}
