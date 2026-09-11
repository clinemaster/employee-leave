// Core domain types for the NAOT Digital Leave Management System frontend.
// Field names mirror the DRF serializers documented in /API.md (backend's
// confirmed spec) verbatim — snake_case, matching the wire format, so no
// case-conversion layer is needed. Do not rename fields to camelCase.

export type Role =
  | "EMPLOYEE"
  | "HEAD_OF_DEPARTMENT"
  | "HEAD_OF_SECTION"
  | "HEAD_OF_UNIT"
  | "HR_ADMIN"
  | "AUTHORIZING_OFFICER"
  | "SYSTEM_ADMIN";

// Any of the three "line manager" roles that review Section B1.
export const HOD_ROLES: Role[] = ["HEAD_OF_DEPARTMENT", "HEAD_OF_SECTION", "HEAD_OF_UNIT"];

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  official_email?: string | null;
  role: Role;
  check_number?: string | null;
  personnel_file_number?: string | null;
  designation?: string | null;
  station?: string | null;
  department?: string | null;
  section?: string | null;
  unit?: string | null;
  manager?: number | null;
  phone_number?: string | null;
  date_of_first_appointment?: string | null;
  is_active: boolean;
  mfa_enabled?: boolean;
}

export type LeaveStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_HOD_REVIEW"
  | "HOD_RECOMMENDED"
  | "RETURNED_TO_EMPLOYEE"
  | "PENDING_HR_REVIEW"
  | "HR_VERIFIED"
  | "RETURNED_TO_HOD"
  | "PENDING_AUTHORIZATION"
  | "APPROVED"
  | "DENIED"
  | "PDF_GENERATED"
  | "COMPLETED"
  | "ARCHIVED";

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  sort_order: number;
}

export interface Holiday {
  id: number;
  date: string; // ISO date
  name: string;
  is_recurring: boolean;
}

export interface OrgUnit {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

export interface LeaveDependant {
  id?: number;
  name: string;
  relationship: string;
  date_of_birth?: string | null;
}

export interface LeaveRecommendation {
  recommended: boolean;
  comments?: string;
  signature_name?: string;
  signature_designation?: string;
  created_at?: string;
}

export interface HRReview {
  verified: boolean;
  comments?: string;
  signature_name?: string;
  signature_designation?: string;
  created_at?: string;
}

export interface ApprovalSection {
  approved: boolean;
  comments?: string;
  signature_name?: string;
  signature_designation?: string;
  created_at?: string;
}

// Section A fields — editable by the applicant only, and only while
// status is DRAFT or RETURNED_TO_EMPLOYEE (enforced server-side).
export interface LeaveApplication {
  id: number;
  employee: number;
  employee_name?: string;
  vote_code?: string;
  sub_vote?: string;
  check_number?: string;
  personnel_file?: string;
  full_name: string;
  designation: string;
  station: string;
  division_department: string;
  phone_number?: string;
  email?: string;
  contact_address?: string;
  leave_type: number;
  leave_type_name?: string;
  leave_number?: string;
  travel_assistance: boolean;
  start_date: string;
  last_date: string;
  dependants: LeaveDependant[];
  travel_routes: TravelRoute[];
  taxi_expenses: TaxiExpense[];
  mizigo_items: MizigoItem[];
  // Read-only, recomputed live on every GET — never stored (see /API.md).
  naule_grand_total?: number;
  taxi_grand_total?: number;
  mizigo_grand_total?: number;
  travel_payment_grand_total?: number;
  status: LeaveStatus;
  recommendation?: LeaveRecommendation | null;
  hr_review?: HRReview | null;
  approval?: ApprovalSection | null;
  working_days_preview?: number;
  total_working_days?: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AuditLogEntry {
  id: number;
  application: number;
  user: number;
  user_name: string;
  role: Role;
  action: string;
  previous_status: LeaveStatus | null;
  new_status: LeaveStatus;
  timestamp: string;
  comments?: string;
}

export interface LeaveDocument {
  id: number;
  application: number;
  document_type: string;
  file: string; // URL
  generated_by: number;
  is_active: boolean;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  message: string;
  is_read: boolean;
  related_application: number | null;
  created_at: string;
}

export interface LeaveBalance {
  id: number;
  employee: number;
  leave_type: number;
  period: string;
  balance_days?: number;
  opening_balance?: number;
  entitlement?: number;
  taken?: number;
  pending?: number;
  remaining?: number;
  // Read-only, for comparison: what the LeavePolicy engine would currently
  // compute (live), and whether `entitlement` has been hand-overridden away
  // from that value (entitlement != computed_entitlement).
  computed_entitlement?: number;
  is_entitlement_overridden?: boolean;
}

// Travel Payment Request ("JEDWALI 1: MCHANGANUO WA MAOMBI YA MALIPO") — NAULI
// (routes), TAXI, and MIZIGO (luggage) line items, added to Section A of the
// leave application. Person types (Wahusika) are admin-configurable via
// /api/person-types/, not hardcoded. Field names are the shapes agreed with
// BACKEND before their API.md update landed — reconcile if it differs.
export interface PersonType {
  id: number;
  name: string;
  code?: string;
  is_active: boolean;
  sort_order: number;
}

export type TripType = "ONE_WAY" | "ROUND_TRIP";

export interface TravelRoutePassenger {
  id?: number;
  person_type: number;
  person_type_name?: string;
  idadi: number;
  // Read-only, server-computed once available (mirrors fare/trips/total
  // client-side in the meantime so the preview never drifts once saved).
  fare?: number;
  trips?: number;
  total?: number;
}

export interface TravelRoute {
  id?: number;
  from_place: string;
  to_place: string;
  fare_per_person: number;
  trip_type: TripType;
  sort_order?: number;
  passengers: TravelRoutePassenger[];
  // Read-only, server-computed on GET (see /API.md "Travel payment request
  // fields"): `trips` (1/2 from trip_type), `naule_total` (sum of this
  // route's passenger totals).
  trips?: number;
  naule_total?: number;
}

export interface TaxiExpense {
  id?: number;
  description?: string;
  number_of_trips: number;
  cost_per_trip: number;
  sort_order?: number;
  total?: number;
}

export interface MizigoItem {
  id?: number;
  description: string;
  quantity: number;
  unit_cost: number;
  sort_order?: number;
  total?: number;
}

// Admin-configurable annual entitlement rules (SYSTEM_ADMIN only), per
// /API.md's "Leave Policies" section. Each rule maps a leave_type + optional
// tenure band (min/max years of service, inclusive; both blank = flat rule)
// to an annual_entitlement in days.
export interface LeavePolicy {
  id: number;
  leave_type: number;
  leave_type_name?: string;
  designation?: string;
  min_years_of_service?: number | null;
  max_years_of_service?: number | null;
  annual_entitlement: number;
  is_active: boolean;
  sort_order: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}
