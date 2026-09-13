"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import type { Control, UseFormRegister, UseFormWatch } from "react-hook-form";
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
  usePreviewWorkingDaysMutation,
} from "@/features/leave/leaveApi";
import { previewWeekdayCount } from "@/utils/workingDays";
import { TravelPaymentStep } from "@/components/leave/TravelPaymentStep";
import { TravelPaymentPreview } from "@/components/leave/TravelPaymentPreview";
import {
  travelRouteSchema,
  taxiExpenseSchema,
  mizigoItemSchema,
} from "@/lib/validation/leaveApplication";
import type { TravelPaymentFormValues } from "@/lib/validation/leaveApplication";
import { orgUnitName } from "@/types";

// Section A fields, per /API.md. `vote_code`/`sub_vote`/`check_number`/
// `personnel_file`/`full_name`/`designation`/`station`/`division_department`
// are shown read-only from the user's profile in Step 1 (still sent to the
// backend on create, since the serializer accepts them — the user profile
// is the source of truth, the applicant is not expected to edit them here).
const dependantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  date_of_birth: z.string().optional(),
});

const formSchema = z
  .object({
    // `.positive()` alone would fail the default value `0` with zod's own
    // "too small" message instead of this custom one (a `{ error }` message
    // on `z.number()` only fires for a genuine type mismatch, not a
    // same-type value that fails a later refinement) — `.refine()` ensures
    // the intended message always fires for the unselected/zero case.
    leave_type: z.number().refine((val) => val > 0, { message: "Select a leave type" }),
    start_date: z.string().min(1, "Start date is required"),
    last_date: z.string().min(1, "End date is required"),
    travel_assistance: z.boolean(),
    contact_address: z.string().optional(),
    phone_number: z.string().optional(),
    email: z.string().optional(),
    dependants: z.array(dependantSchema),
    travel_routes: z.array(travelRouteSchema),
    taxi_expenses: z.array(taxiExpenseSchema),
    mizigo_items: z.array(mizigoItemSchema),
  })
  .refine((data) => new Date(data.last_date) >= new Date(data.start_date), {
    message: "End date must be on or after start date",
    path: ["last_date"],
  });

type FormValues = z.infer<typeof formSchema>;

const STEPS = [
  "Personal Info",
  "Leave Request",
  "Dependants",
  "Travel Route Payment Request",
  "Review & Submit",
] as const;

export function LeaveApplicationForm() {
  const router = useRouter();
  const user = useAppSelector(selectCurrentUser);
  const { data: leaveTypes } = useGetLeaveTypesQuery();
  const [createLeaveApplication, { isLoading: isSaving }] = useCreateLeaveApplicationMutation();
  const [submitLeaveApplication, { isLoading: isSubmitting }] = useSubmitLeaveApplicationMutation();
  const [previewWorkingDays, { data: serverPreview }] = usePreviewWorkingDaysMutation();
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
      leave_type: 0,
      start_date: "",
      last_date: "",
      travel_assistance: false,
      contact_address: "",
      phone_number: user?.phone_number ?? "",
      email: user?.email ?? "",
      dependants: [],
      travel_routes: [],
      taxi_expenses: [],
      mizigo_items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "dependants" });
  const startDate = watch("start_date");
  const lastDate = watch("last_date");
  const travelAssistance = watch("travel_assistance");
  const clientPreviewDays = useMemo(() => previewWeekdayCount(startDate, lastDate), [startDate, lastDate]);

  async function goNext() {
    const fieldsPerStep: (keyof FormValues)[][] = [
      [],
      ["leave_type", "start_date", "last_date"],
      [],
      ["travel_routes", "taxi_expenses", "mizigo_items"],
      [],
    ];
    const valid = await trigger(fieldsPerStep[step]);
    if (valid) {
      if (step === 1 && startDate && lastDate) {
        previewWorkingDays({ start_date: startDate, last_date: lastDate });
      }
      // No travel assistance -> Dependants and Travel Payment Request don't
      // apply, so skip straight from Leave Request to Review & Submit.
      if (step === 1 && !travelAssistance) {
        setStep(STEPS.length - 1);
        return;
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  function goBack() {
    if (step === STEPS.length - 1 && !travelAssistance) {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  function sectionAPayload(values: FormValues) {
    return {
      vote_code: undefined,
      sub_vote: undefined,
      check_number: user?.check_number ?? undefined,
      personnel_file: user?.personnel_file_number ?? undefined,
      full_name: user?.full_name ?? "",
      designation: user?.designation_name ?? "",
      station: user?.work_station_name ?? "",
      division_department: orgUnitName(user) ?? "",
      phone_number: values.phone_number,
      email: values.email,
      contact_address: values.contact_address,
      leave_type: values.leave_type,
      travel_assistance: values.travel_assistance,
      start_date: values.start_date,
      last_date: values.last_date,
      dependants: values.dependants,
      travel_routes: values.travel_routes,
      taxi_expenses: values.taxi_expenses,
      mizigo_items: values.mizigo_items,
    };
  }

  async function onSaveDraft(values: FormValues) {
    setServerError(null);
    try {
      await createLeaveApplication(sectionAPayload(values)).unwrap();
      router.push("/employee/applications");
    } catch {
      setServerError("Could not save draft. Please try again.");
    }
  }

  async function onSubmitFinal(values: FormValues) {
    setServerError(null);
    try {
      const created = await createLeaveApplication(sectionAPayload(values)).unwrap();
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
              <ReadOnlyField label="Full Name" value={user?.full_name} />
              <ReadOnlyField label="Check Number" value={user?.check_number} />
              <ReadOnlyField label="Personnel File Number" value={user?.personnel_file_number} />
              <ReadOnlyField label="Department" value={orgUnitName(user)} />
              <ReadOnlyField label="Work Station" value={user?.work_station_name} />
              <ReadOnlyField label="Designation" value={user?.designation_name} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Leave Request</h2>
            <div>
              <Label htmlFor="leave_type">Leave Type</Label>
              <select
                id="leave_type"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register("leave_type", { valueAsNumber: true })}
              >
                <option value="">Select leave type</option>
                {leaveTypes?.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>
              {errors.leave_type ? <p className="mt-1 text-xs text-red-600">{errors.leave_type.message}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input id="start_date" type="date" {...register("start_date")} error={errors.start_date?.message} />
              </div>
              <div>
                <Label htmlFor="last_date">End Date</Label>
                <Input id="last_date" type="date" {...register("last_date")} error={errors.last_date?.message} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Estimated working days (client preview, weekdays only — excludes holidays):{" "}
              <span className="font-semibold text-gray-800">{clientPreviewDays}</span>
              {serverPreview ? (
                <>
                  {" "}
                  · Server preview (excludes holidays too):{" "}
                  <span className="font-semibold text-gray-800">{serverPreview.working_days}</span>
                </>
              ) : null}
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" {...register("travel_assistance")} />
              Request travel assistance
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_address">Address While on Leave</Label>
                <Input id="contact_address" {...register("contact_address")} />
              </div>
              <div>
                <Label htmlFor="phone_number">Contact Phone</Label>
                <Input id="phone_number" {...register("phone_number")} />
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
                  <Input {...register(`dependants.${index}.name` as const)} />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Input {...register(`dependants.${index}.relationship` as const)} />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input type="date" {...register(`dependants.${index}.date_of_birth` as const)} />
                </div>
                <Button type="button" variant="danger" onClick={() => remove(index)}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => append({ name: "", relationship: "", date_of_birth: "" })}
            >
              + Add Dependant
            </Button>
          </div>
        )}

        {step === 3 && (
          <TravelPaymentStep
            control={control as unknown as Control<TravelPaymentFormValues>}
            register={register as unknown as UseFormRegister<TravelPaymentFormValues>}
            watch={watch as unknown as UseFormWatch<TravelPaymentFormValues>}
          />
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Review &amp; Submit</h2>
            <ReviewRow
              label="Leave Type"
              value={leaveTypes?.find((lt) => lt.id === Number(watch("leave_type")))?.name}
            />
            <ReviewRow label="Dates" value={`${startDate} to ${lastDate} (${clientPreviewDays} working days, preview)`} />
            <ReviewRow label="Travel Assistance" value={watch("travel_assistance") ? "Requested" : "Not requested"} />
            <ReviewRow label="Dependants" value={String(fields.length)} />
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900">Travel Payment Request</p>
              <TravelPaymentPreview
                routes={watch("travel_routes")}
                taxi={watch("taxi_expenses")}
                mizigo={watch("mizigo_items")}
              />
            </div>
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
