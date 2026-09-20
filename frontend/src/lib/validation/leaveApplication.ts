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

// Travel Payment Request ("JEDWALI 1") — NAULI (routes) / TAXI / MIZIGO.
// Idadi/quantity/number_of_trips are non-negative integers (0 is allowed —
// e.g. "no travelers of this type on this route"); fare/cost values must be
// positive; from/to are required non-empty strings whenever a route exists.
export const travelRoutePassengerSchema = z.object({
  person_type: z.number(),
  person_type_name: z.string().optional(),
  idadi: z.number({ error: "Idadi must be a number" }).int("Idadi must be a whole number").min(0, "Idadi must be 0 or more"),
});

export const travelRouteSchema = z.object({
  from_place: z.string().min(1, "From is required"),
  to_place: z.string().min(1, "To is required"),
  fare_per_person: z.number({ error: "Fare must be a number" }).positive("Fare must be greater than 0"),
  trip_type: z.enum(["ONE_WAY", "ROUND_TRIP"]),
  passengers: z.array(travelRoutePassengerSchema),
});

export const taxiExpenseSchema = z.object({
  description: z.string().optional(),
  number_of_trips: z
    .number({ error: "Number of trips must be a number" })
    .int("Number of trips must be a whole number")
    .min(0, "Number of trips must be 0 or more"),
  cost_per_trip: z.number({ error: "Cost per trip must be a number" }).positive("Cost per trip must be greater than 0"),
});

export const mizigoItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(0, "Quantity must be 0 or more"),
  unit_cost: z.number({ error: "Unit cost must be a number" }).positive("Unit cost must be greater than 0"),
});

export const travelPaymentSchema = z.object({
  travel_routes: z.array(travelRouteSchema),
  taxi_expenses: z.array(taxiExpenseSchema),
  mizigo_items: z.array(mizigoItemSchema),
});

export type TravelRouteFormValues = z.infer<typeof travelRouteSchema>;
export type TaxiExpenseFormValues = z.infer<typeof taxiExpenseSchema>;
export type MizigoItemFormValues = z.infer<typeof mizigoItemSchema>;
export type TravelPaymentFormValues = z.infer<typeof travelPaymentSchema>;

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

// CAG review — mandatory stand-in for Section B1 for applicants whose role
// requires it (see LeaveApplication.requires_cag_review).
export const cagReviewSchema = z.object({
  comments: z.string().optional(),
  signature_name: z.string().min(1, "Name is required"),
  signature_designation: z.string().min(1, "Designation is required"),
});

export const cagRejectSchema = z.object({
  comments: z.string().min(1, "A reason is required to reject"),
});

// AAG review — mandatory stand-in for Section B1 for Division employees
// whose role doesn't itself require CAG review (see
// LeaveApplication.requires_aag_review).
export const aagReviewSchema = z.object({
  comments: z.string().optional(),
  signature_name: z.string().min(1, "Name is required"),
  signature_designation: z.string().min(1, "Designation is required"),
});

export const aagRejectSchema = z.object({
  comments: z.string().min(1, "A reason is required to reject"),
});

export type HodRecommendationFormValues = z.infer<typeof hodRecommendationSchema>;
export type HrReviewFormValues = z.infer<typeof hrReviewSchema>;
export type ApprovalFormValues = z.infer<typeof approvalSchema>;
export type DenyFormValues = z.infer<typeof denySchema>;
export type HodReturnFormValues = z.infer<typeof hodReturnSchema>;
export type CagReviewFormValues = z.infer<typeof cagReviewSchema>;
export type CagRejectFormValues = z.infer<typeof cagRejectSchema>;
export type AagReviewFormValues = z.infer<typeof aagReviewSchema>;
export type AagRejectFormValues = z.infer<typeof aagRejectSchema>;
