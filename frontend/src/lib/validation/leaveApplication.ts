import { z } from "zod";

// Client-side mirrors of the section-scoped validation the backend enforces
// (see /API.md). Not currently wired into the workflow forms (those use
// lightweight local state — see components/workflow/*) but kept here as the
// canonical schema reference if those forms are upgraded to react-hook-form.

export const dependantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  date_of_birth: z.string().optional(),
});

export const leaveRequestSchema = z
  .object({
    // See LeaveApplicationForm.tsx's identical schema for why `.refine()`
    // is used instead of `.positive()` here.
    leave_type: z.number().refine((val) => val > 0, { message: "Select a leave type" }),
    start_date: z.string().min(1, "Start date is required"),
    last_date: z.string().min(1, "End date is required"),
    contact_address: z.string().optional(),
    phone_number: z.string().optional(),
    email: z.string().optional(),
    travel_assistance: z.boolean().default(false),
  })
  .refine((data) => new Date(data.last_date) >= new Date(data.start_date), {
    message: "End date must be on or after start date",
    path: ["last_date"],
  });

export type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;
export type DependantFormValues = z.infer<typeof dependantSchema>;

// Section B1 — HOD/HOS/HOU recommendation.
export const hodRecommendationSchema = z
  .object({
    decision: z.boolean(),
    comments: z.string().optional(),
    signature_name: z.string().min(1, "Name is required"),
    signature_designation: z.string().min(1, "Designation is required"),
  })
  .refine((data) => data.decision || Boolean(data.comments?.trim()), {
    message: "Comments are required when not recommending",
    path: ["comments"],
  });

// Section C — Authorizing Officer decision.
export const approvalSchema = z.object({
  comments: z.string().optional(),
  signature_name: z.string().min(1, "Name is required"),
  signature_designation: z.string().min(1, "Designation is required"),
});

export const denySchema = z.object({
  comments: z.string().min(1, "A reason is required to deny"),
  signature_name: z.string().min(1, "Name is required"),
  signature_designation: z.string().min(1, "Designation is required"),
});

// Section B2 — HR_ADMIN review.
export const hrReviewSchema = z.object({
  decision: z.boolean(),
  comments: z.string().optional(),
  signature_name: z.string().min(1, "Name is required"),
  signature_designation: z.string().min(1, "Designation is required"),
});

export const hodReturnSchema = z.object({
  comments: z.string().min(1, "Comments are required to return the application"),
});

export type HodRecommendationFormValues = z.infer<typeof hodRecommendationSchema>;
export type HrReviewFormValues = z.infer<typeof hrReviewSchema>;
export type ApprovalFormValues = z.infer<typeof approvalSchema>;
export type DenyFormValues = z.infer<typeof denySchema>;
export type HodReturnFormValues = z.infer<typeof hodReturnSchema>;
