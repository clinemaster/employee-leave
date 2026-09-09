"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useApproveLeaveApplicationMutation, useDenyLeaveApplicationMutation } from "@/features/leave/leaveApi";
import { approvalSchema, denySchema, type ApprovalFormValues, type DenyFormValues } from "@/lib/validation/leaveApplication";

// Section C — AUTHORIZING_OFFICER. POST .../approve/ or .../deny/ with
// comments, signature_name/designation. A reason (comments) is required to
// deny. Travel assistance is requested by the applicant in Section A
// (`travel_assistance`, shown read-only above) — API.md does not document a
// separate travel-assistance decision field on Section C.
export function ApprovalForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [approve, { isLoading: isApproving }] = useApproveLeaveApplicationMutation();
  const [deny, { isLoading: isDenying }] = useDenyLeaveApplicationMutation();

  const {
    register: registerApprove,
    handleSubmit: handleApproveSubmit,
    formState: { errors: approveErrors },
  } = useForm<ApprovalFormValues>({
    resolver: zodResolver(approvalSchema),
    defaultValues: { comments: "", signature_name: "", signature_designation: "" },
  });

  const {
    register: registerDeny,
    handleSubmit: handleDenySubmit,
    formState: { errors: denyErrors },
  } = useForm<DenyFormValues>({
    resolver: zodResolver(denySchema),
    defaultValues: { comments: "", signature_name: "", signature_designation: "" },
  });

  async function onApprove(values: ApprovalFormValues) {
    await approve({
      id: applicationId,
      comments: values.comments,
      signature_name: values.signature_name,
      signature_designation: values.signature_designation,
    }).unwrap();
    router.push("/authorization/applications");
  }

  async function onDeny(values: DenyFormValues) {
    await deny({
      id: applicationId,
      comments: values.comments,
      signature_name: values.signature_name,
      signature_designation: values.signature_designation,
    }).unwrap();
    router.push("/authorization/applications");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Section C — Authorization</CardTitle>
      </CardHeader>
      <form className="space-y-4" onSubmit={handleApproveSubmit(onApprove)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="signatureName">Name</Label>
            <Input id="signatureName" error={approveErrors.signature_name?.message} {...registerApprove("signature_name")} />
          </div>
          <div>
            <Label htmlFor="signatureDesignation">Designation</Label>
            <Input
              id="signatureDesignation"
              error={approveErrors.signature_designation?.message}
              {...registerApprove("signature_designation")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="comments">Comments (approval)</Label>
          <textarea
            id="comments"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...registerApprove("comments")}
          />
        </div>
        <Button type="submit" disabled={isApproving}>
          Approve
        </Button>
      </form>

      <form className="mt-6 border-t border-gray-100 pt-4" onSubmit={handleDenySubmit(onDeny)}>
        <Label htmlFor="denyReason">Reason for Denial (required to deny)</Label>
        <textarea
          id="denyReason"
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...registerDeny("comments")}
        />
        {denyErrors.comments ? <p className="mt-1 text-xs text-red-600">{denyErrors.comments.message}</p> : null}
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="denySignatureName">Name</Label>
            <Input id="denySignatureName" error={denyErrors.signature_name?.message} {...registerDeny("signature_name")} />
          </div>
          <div>
            <Label htmlFor="denySignatureDesignation">Designation</Label>
            <Input
              id="denySignatureDesignation"
              error={denyErrors.signature_designation?.message}
              {...registerDeny("signature_designation")}
            />
          </div>
        </div>
        <Button type="submit" variant="danger" className="mt-2" disabled={isDenying}>
          Deny
        </Button>
      </form>
    </Card>
  );
}
