import { z } from "zod";

export const dependantSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  dateOfBirth: z.string().optional(),
});

export const leaveRequestSchema = z
  .object({
    leaveTypeId: z.number({ error: "Select a leave type" }).positive(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string().optional(),
    address: z.string().optional(),
    contactPhone: z.string().optional(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export const dependantsStepSchema = z.object({
  dependants: z.array(dependantSchema).default([]),
});

export const fullLeaveApplicationSchema = leaveRequestSchema.and(dependantsStepSchema);

export type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;
export type DependantFormValues = z.infer<typeof dependantSchema>;

// HOD Section B1
export const hodRecommendationSchema = z
  .object({
    decision: z.enum(["RECOMMEND", "RECOMMEND_WITH_CHANGES", "DO_NOT_RECOMMEND"]),
    comments: z.string().optional(),
    officerName: z.string().min(1, "Officer name is required"),
    officerDesignation: z.string().min(1, "Designation is required"),
  })
  .refine((data) => data.decision === "RECOMMEND" || Boolean(data.comments?.trim()), {
    message: "Comments are required unless recommending without changes",
    path: ["comments"],
  });

// Authorizing Officer Section C
export const approvalSchema = z
  .object({
    decision: z.enum(["APPROVE", "DENY"]),
    travelAssistance: z.boolean().default(false),
    reason: z.string().optional(),
  })
  .refine((data) => data.decision === "APPROVE" || Boolean(data.reason?.trim()), {
    message: "A reason is required when denying",
    path: ["reason"],
  });
