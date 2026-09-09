"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import { useGetLeaveTypesQuery } from "@/features/leave/catalogApi";
import {
  useCreateLeaveApplicationMutation,
  useSubmitLeaveApplicationMutation,
} from "@/features/leave/leaveApi";
import { previewWeekdayCount } from "@/utils/workingDays";

const dependantSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  dateOfBirth: z.string().optional(),
});

const formSchema = z
  .object({
    leaveTypeId: z.number({ error: "Select a leave type" }).positive(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string().optional(),
    address: z.string().optional(),
    contactPhone: z.string().optional(),
    dependants: z.array(dependantSchema),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof formSchema>;

const STEPS = ["Personal Info", "Leave Request", "Dependants", "Review & Submit"] as const;

export function LeaveApplicationForm() {
  const router = useRouter();
  const user = useAppSelector(selectCurrentUser);
  const { data: leaveTypes } = useGetLeaveTypesQuery();
  const [createLeaveApplication, { isLoading: isSaving }] = useCreateLeaveApplicationMutation();
  const [submitLeaveApplication, { isLoading: isSubmitting }] = useSubmitLeaveApplicationMutation();
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaveTypeId: 0,
      startDate: "",
      endDate: "",
      reason: "",
      address: "",
      contactPhone: "",
      dependants: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "dependants" });
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const previewDays = useMemo(() => previewWeekdayCount(startDate, endDate), [startDate, endDate]);

  async function goNext() {
    const fieldsPerStep: (keyof FormValues)[][] = [[], ["leaveTypeId", "startDate", "endDate"], [], []];
    const valid = await trigger(fieldsPerStep[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSaveDraft(values: FormValues) {
    setServerError(null);
    try {
      await createLeaveApplication({ ...values, isDraft: true }).unwrap();
      router.push("/employee/applications");
    } catch {
      setServerError("Could not save draft. Please try again.");
    }
  }

  async function onSubmitFinal(values: FormValues) {
    setServerError(null);
    try {
      const created = await createLeaveApplication({ ...values, isDraft: false }).unwrap();
      await submitLeaveApplication({ id: created.id }).unwrap();
      router.push("/employee/applications");
    } catch {
      setServerError("Could not submit application. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                index <= step ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {index + 1}
            </span>
            <span className={`text-xs ${index === step ? "font-semibold text-gray-900" : "text-gray-500"}`}>
              {label}
            </span>
            {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-gray-200" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Personal Information</h2>
            <p className="text-xs text-gray-500">Pre-filled from your profile — read only.</p>
            <div className="grid grid-cols-2 gap-4">
              <ReadOnlyField label="Full Name" value={user?.fullName} />
              <ReadOnlyField label="Employee Number" value={user?.employeeNumber ?? "-"} />
              <ReadOnlyField label="Department" value={user?.department ?? "-"} />
              <ReadOnlyField label="Designation" value={user?.designation ?? "-"} />
              <ReadOnlyField label="Email" value={user?.email} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Leave Request</h2>
            <div>
              <Label htmlFor="leaveTypeId">Leave Type</Label>
              <select
                id="leaveTypeId"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register("leaveTypeId", { valueAsNumber: true })}
              >
                <option value="">Select leave type</option>
                {leaveTypes?.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>
              {errors.leaveTypeId ? (
                <p className="mt-1 text-xs text-red-600">{errors.leaveTypeId.message}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" {...register("startDate")} error={errors.startDate?.message} />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" {...register("endDate")} error={errors.endDate?.message} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Estimated working days (preview, weekdays only — excludes holidays; final count is computed by
              the server): <span className="font-semibold text-gray-800">{previewDays}</span>
            </p>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                rows={3}
                {...register("reason")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address">Address While on Leave</Label>
                <Input id="address" {...register("address")} />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input id="contactPhone" {...register("contactPhone")} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Dependants</h2>
            {fields.length === 0 ? (
              <p className="text-sm text-gray-500">No dependants added yet.</p>
            ) : null}
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-4 items-end gap-3 rounded-md border border-gray-100 p-3">
                <div>
                  <Label>Full Name</Label>
                  <Input {...register(`dependants.${index}.fullName` as const)} />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Input {...register(`dependants.${index}.relationship` as const)} />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" {...register(`dependants.${index}.dateOfBirth` as const)} />
                </div>
                <Button type="button" variant="danger" onClick={() => remove(index)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => append({ fullName: "", relationship: "", dateOfBirth: "" })}
            >
              + Add Dependant
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Review &amp; Submit</h2>
            <ReviewRow label="Leave Type" value={leaveTypes?.find((lt) => lt.id === Number(watch("leaveTypeId")))?.name} />
            <ReviewRow label="Dates" value={`${startDate} to ${endDate} (${previewDays} working days, preview)`} />
            <ReviewRow label="Reason" value={watch("reason") || "-"} />
            <ReviewRow label="Dependants" value={String(fields.length)} />
            {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={handleSubmit(onSaveDraft)}
            >
              Save Draft
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button type="button" disabled={isSubmitting} onClick={handleSubmit(onSubmitFinal)}>
                Submit
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || "-"}</p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value || "-"}</span>
    </div>
  );
}
