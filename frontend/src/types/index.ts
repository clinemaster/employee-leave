// Core domain types for the NAOT Digital Leave Management System frontend.
// NOTE: These shapes are our current best guess based on the project spec.
// They are intentionally centralized here so that once the BACKEND agent
// confirms exact field names / enum values, only this file (and lib/api/*)
// need to change. Search for "TODO(api-confirm)" for places likely to shift.

export type Role =
  | "EMPLOYEE"
  | "HOD"
  | "HR"
  | "AUTHORIZING_OFFICER"
  | "ADMIN";

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  department?: string | null;
  designation?: string | null;
  employeeNumber?: string | null;
  isActive: boolean;
}

export type LeaveStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "RECOMMENDED"
  | "RETURNED_BY_HOD"
  | "VERIFIED"
  | "RETURNED_BY_HR"
  | "APPROVED"
  | "DENIED";

export type LeaveStage =
  | "APPLICANT"
  | "HOD"
  | "HR"
  | "AUTHORIZING_OFFICER"
  | "COMPLETE";

export type RecommendationDecision =
  | "RECOMMEND"
  | "RECOMMEND_WITH_CHANGES"
  | "DO_NOT_RECOMMEND";

export type ApprovalDecision = "APPROVE" | "DENY";

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  order: number;
  maxDaysPerYear?: number | null;
}

export interface Holiday {
  id: number;
  name: string;
  date: string; // ISO date
}

export interface LeaveDependant {
  id?: number;
  fullName: string;
  relationship: string;
  dateOfBirth?: string | null;
}

export interface LeaveRecommendation {
  decision: RecommendationDecision;
  comments?: string;
  officerName?: string;
  officerDesignation?: string;
  date?: string;
}

export interface HRReview {
  leaveBalanceDays?: number;
  daysRequested?: number;
  balanceAfter?: number;
  comments?: string;
  verifiedBy?: string;
  date?: string;
}

export interface ApprovalSection {
  decision: ApprovalDecision;
  travelAssistance?: boolean;
  reason?: string; // required when DENY
  approverName?: string;
  approverDesignation?: string;
  date?: string;
}

export interface LeaveApplication {
  id: number;
  applicant: User;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  workingDays?: number;
  reason?: string;
  address?: string;
  contactPhone?: string;
  dependants: LeaveDependant[];
  status: LeaveStatus;
  stage: LeaveStage;
  hodRecommendation?: LeaveRecommendation | null;
  hrReview?: HRReview | null;
  approval?: ApprovalSection | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
}

export interface LeaveApplicationListItem {
  id: number;
  applicantName: string;
  department?: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  workingDays?: number;
  status: LeaveStatus;
  stage: LeaveStage;
  lastAction?: string | null;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AuditLogEntry {
  id: number;
  action: string;
  actor: string;
  timestamp: string;
  notes?: string;
}

export interface LeaveDocument {
  id: number;
  name: string;
  url: string;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  denied: number;
  returned: number;
}
