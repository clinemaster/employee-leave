// Core domain types for the NAOT Digital Leave Management System frontend.
// Field names mirror the DRF serializers documented in /API.md (backend's
// confirmed spec) verbatim — snake_case, matching the wire format, so no
// case-conversion layer is needed. Do not rename fields to camelCase.

export type Role =
  | "EMPLOYEE"
  | "HEAD_OF_DEPARTMENT"
  | "DAG"
  | "HEAD_OF_SECTION"
  | "HR_ADMIN"
  | "AUTHORIZING_OFFICER"
  | "CAG"
  | "AAG"
  | "CHIEF_ACCOUNTANT"
  | "DAHRM"
  | "ADA"
  | "CHIEF_EXTERNAL_AUDITOR"
  | "SYSTEM_ADMIN";

// Applicant roles whose leave applications must be routed through CAG
// review instead of the normal HOD stage (see backend
// apps.accounts.models.CAG_APPLICANT_ROLES / LeaveApplication.requires_cag_review).
// CHIEF_EXTERNAL_AUDITOR is deliberately NOT included -- their own leave
// routes through AAG instead, matched by work station (see
// requires_aag_review), since they have no division to match by.
export const CAG_APPLICANT_ROLES: Role[] = [
  "AUTHORIZING_OFFICER",
  "HEAD_OF_DEPARTMENT",
  "DAG",
  "AAG",
  "CHIEF_ACCOUNTANT",
  "DAHRM",
  "ADA",
];

// Any of the "line manager" roles that review Section B1. CHIEF_EXTERNAL_AUDITOR
// acts as "head of work station" for employees at their work station whose
// department/division has no active head and no manager set (see backend
// apps.leave.permissions.matched_cea_for) -- department/division heads
// always take priority.
export const HOD_ROLES: Role[] = [
  "HEAD_OF_DEPARTMENT",
  "DAG",
  "HEAD_OF_SECTION",
  "CHIEF_EXTERNAL_AUDITOR",
];

// Tanzania's regions (mikoa) — mirrors backend apps.accounts.models.Region
// exactly. Used for User.place_of_domicile (a fixed enumeration, not an
// admin-managed catalog like Designation/Work Station).
export type Region =
  | "ARUSHA"
  | "DAR_ES_SALAAM"
  | "DODOMA"
  | "GEITA"
  | "IRINGA"
  | "KAGERA"
  | "KATAVI"
  | "KIGOMA"
  | "KILIMANJARO"
  | "LINDI"
  | "MANYARA"
  | "MARA"
  | "MBEYA"
  | "MOROGORO"
  | "MTWARA"
  | "MWANZA"
  | "NJOMBE"
  | "PEMBA_NORTH"
  | "PEMBA_SOUTH"
  | "PWANI"
  | "RUKWA"
  | "RUVUMA"
  | "SHINYANGA"
  | "SIMIYU"
  | "SINGIDA"
  | "SONGWE"
  | "TABORA"
  | "TANGA"
  | "ZANZIBAR_NORTH"
  | "ZANZIBAR_SOUTH"
  | "ZANZIBAR_WEST";

export const REGIONS: { code: Region; label: string }[] = [
  { code: "ARUSHA", label: "Arusha" },
  { code: "DAR_ES_SALAAM", label: "Dar es Salaam" },
  { code: "DODOMA", label: "Dodoma" },
  { code: "GEITA", label: "Geita" },
  { code: "IRINGA", label: "Iringa" },
  { code: "KAGERA", label: "Kagera" },
  { code: "KATAVI", label: "Katavi" },
  { code: "KIGOMA", label: "Kigoma" },
  { code: "KILIMANJARO", label: "Kilimanjaro" },
  { code: "LINDI", label: "Lindi" },
  { code: "MANYARA", label: "Manyara" },
  { code: "MARA", label: "Mara" },
  { code: "MBEYA", label: "Mbeya" },
  { code: "MOROGORO", label: "Morogoro" },
  { code: "MTWARA", label: "Mtwara" },
  { code: "MWANZA", label: "Mwanza" },
  { code: "NJOMBE", label: "Njombe" },
  { code: "PEMBA_NORTH", label: "Pemba North" },
  { code: "PEMBA_SOUTH", label: "Pemba South" },
  { code: "PWANI", label: "Pwani" },
  { code: "RUKWA", label: "Rukwa" },
  { code: "RUVUMA", label: "Ruvuma" },
  { code: "SHINYANGA", label: "Shinyanga" },
  { code: "SIMIYU", label: "Simiyu" },
  { code: "SINGIDA", label: "Singida" },
  { code: "SONGWE", label: "Songwe" },
  { code: "TABORA", label: "Tabora" },
  { code: "TANGA", label: "Tanga" },
  { code: "ZANZIBAR_NORTH", label: "Zanzibar North" },
  { code: "ZANZIBAR_SOUTH", label: "Zanzibar South" },
  { code: "ZANZIBAR_WEST", label: "Zanzibar West" },
];

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  official_email?: string | null;
  role: Role;
  // Roles held in addition to `role` (e.g. an EMPLOYEE also designated
  // HEAD_OF_DEPARTMENT) — see allUserRoles(). Read-only; set via
  // UserWriteSerializer's `additional_roles` on create/update.
  additional_roles?: Role[];
  check_number?: string | null;
  personnel_file_number?: string | null;
  place_of_domicile?: Region | "" | null;
  designation?: number | null;
  designation_name?: string | null;
  work_station?: number | null;
  work_station_name?: string | null;
  department?: number | null;
  department_name?: string | null;
  division?: number | null;
  division_name?: string | null;
  section?: number | null;
  section_name?: string | null;
  manager?: number | null;
  phone_number?: string | null;
  vote_code?: string | null;
  sub_vote?: string | null;
  date_of_first_appointment?: string | null;
  is_active: boolean;
  mfa_enabled?: boolean;
}

// The full set of roles a user holds: base `role` plus any additional_roles.
export function allUserRoles(user: Pick<User, "role" | "additional_roles"> | null | undefined): Role[] {
  if (!user) return [];
  return [user.role, ...(user.additional_roles ?? [])];
}

// The name of whichever of department/division the user belongs to (never
// work_station -- that's shown/sent as its own separate field everywhere
// this is used, e.g. LeaveApplicationForm's `station` and this page's "Work
// Station" field). Null for a work-station-primary employee, who has
// neither.
export function orgUnitName(
  user: Pick<User, "department_name" | "division_name"> | null | undefined
): string | null {
  if (!user) return null;
  return user.department_name ?? user.division_name ?? null;
}

export type LeaveStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_HOD_REVIEW"
  | "HOD_RECOMMENDED"
  | "PENDING_CAG_REVIEW"
  | "CAG_RECOMMENDED"
  | "PENDING_AAG_REVIEW"
  | "AAG_RECOMMENDED"
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

export interface CAGReview {
  recommended: boolean;
  comments?: string;
  signature_name?: string;
  signature_designation?: string;
  created_at?: string;
}

export interface AAGReview {
  recommended: boolean;
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
  // Derived server-side from `status` — see backend LeaveApplication.
  // current_location/current_status_label. Never independently editable.
  current_location?: string;
  current_status_label?: string;
  // Derived server-side from the employee's role — see backend
  // LeaveApplication.requires_cag_review. True if this application must be
  // routed through CAG review instead of the normal HOD stage.
  requires_cag_review?: boolean;
  // Derived server-side from the employee's division — see backend
  // LeaveApplication.requires_aag_review. True if this application must be
  // routed through AAG review instead of the normal HOD stage (only when
  // requires_cag_review is false — CAG takes priority).
  requires_aag_review?: boolean;
  // Derived server-side from the employee's org assignment — see backend
  // LeaveApplication.requires_cea_review. True if the normal HOD stage is
  // filled by the CHIEF_EXTERNAL_AUDITOR at the employee's work station
  // instead of a department/division Head (employees whose only org
  // assignment is a work station, with no department or division).
  requires_cea_review?: boolean;
  recommendation?: LeaveRecommendation | null;
  cag_review?: CAGReview | null;
  aag_review?: AAGReview | null;
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
  previous_location?: string | null;
  new_location?: string;
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

// SYSTEM_ADMIN-configured fixed TAXI/MIZIGO amount, auto-applied to every
// leave application that requests travel assistance (see backend
// apps.leave.models.TravelPaymentSettings) — not itemized/employee-entered.
// Null = that category isn't configured (contributes 0). Singleton — no id,
// always GET/PUT /api/travel-payment-settings/.
export interface TravelPaymentSettings {
  taxi_amount: number | null;
  mizigo_amount: number | null;
  updated_at?: string;
}
