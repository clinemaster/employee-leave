import { baseApi } from "@/lib/api/baseApi";
import type {
  AuditLogEntry,
  LeaveApplication,
  LeaveDependant,
  LeaveDocument,
  MizigoItem,
  PaginatedResponse,
  TaxiExpense,
  TravelRoute,
} from "@/types";

// Matches /API.md "Leave Applications" section verbatim. Row-level access
// (IDOR protection) and section-scoped edit enforcement happen server-side —
// this file only shapes requests/responses.

export interface LeaveApplicationListParams {
  status?: string;
  leave_type?: number;
  employee?: number;
  page?: number;
  // Best-effort extra filters for the HR search UI. /API.md only documents
  // `status`, `leave_type`, `employee` as guaranteed query params — these
  // additional ones (check number, personnel file, department, station,
  // date range, free-text search) are sent optimistically; DRF filter
  // backends generally ignore unrecognized query params rather than error,
  // but they only narrow results if/when the backend wires up matching
  // filterset fields. See FRONTEND.md "Deferred".
  search?: string;
  check_number?: string;
  personnel_file?: string;
  division_department?: string;
  station?: string;
  start_date?: string;
  last_date?: string;
}

// Section A fields (see API.md) — the only fields an applicant may send on
// create/update, and only while DRAFT or RETURNED_TO_EMPLOYEE.
export interface SectionAFields {
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
  leave_number?: string;
  travel_assistance: boolean;
  start_date: string;
  last_date: string;
  dependants?: LeaveDependant[];
  // Travel Payment Request ("JEDWALI 1") — always shown as Step 4 of the
  // application form, not conditional on `travel_assistance`.
  travel_routes?: TravelRoute[];
  taxi_expenses?: TaxiExpense[];
  mizigo_items?: MizigoItem[];
}

type UpdateLeaveApplicationRequest = Partial<SectionAFields> & { id: number };

// Workflow action bodies: { comments?, decision?, signature_name?, signature_designation? }
interface WorkflowActionBody {
  id: number;
  comments?: string;
  decision?: boolean; // used by recommend (recommended?) and verify (verified?)
  signature_name?: string;
  signature_designation?: string;
}

function listTags(result?: PaginatedResponse<LeaveApplication>) {
  const items = result?.results ?? [];
  return [
    ...items.map((item) => ({ type: "LeaveApplication" as const, id: item.id })),
    { type: "LeaveApplications" as const, id: "LIST" },
  ];
}

export const leaveApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeaveApplications: builder.query<PaginatedResponse<LeaveApplication>, LeaveApplicationListParams | void>({
      query: (params) => ({
        url: "leave-applications/",
        params: params ?? undefined,
      }),
      providesTags: listTags,
    }),

    getLeaveApplication: builder.query<LeaveApplication, number>({
      query: (id) => `leave-applications/${id}/`,
      providesTags: (_result, _error, id) => [{ type: "LeaveApplication", id }],
    }),

    createLeaveApplication: builder.mutation<LeaveApplication, SectionAFields>({
      query: (body) => ({
        url: "leave-applications/",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "LeaveApplications", id: "LIST" }, "Dashboard"],
    }),

    updateLeaveApplication: builder.mutation<LeaveApplication, UpdateLeaveApplicationRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    submitLeaveApplication: builder.mutation<LeaveApplication, { id: number }>({
      query: ({ id }) => ({ url: `leave-applications/${id}/submit/`, method: "POST" }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    // Section B1 — HOD/HOS/HOU. `decision: true` = recommended.
    recommendLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/recommend/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    returnLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/return/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    // CAG review — mandatory stand-in for Section B1 for applicants whose
    // role requires it (see LeaveApplication.requires_cag_review).
    // `decision: true` = recommended (defaulted server-side).
    cagReviewLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/cag-review/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    // CAG rejection — terminal, `comments` (rejection reason) is mandatory
    // (enforced server-side).
    cagRejectLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/cag-reject/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    // Section B2 — HR_ADMIN. `decision: true` = verified.
    verifyLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/verify/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    // Section C — AUTHORIZING_OFFICER.
    approveLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/approve/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    denyLeaveApplication: builder.mutation<LeaveApplication, WorkflowActionBody>({
      query: ({ id, ...body }) => ({ url: `leave-applications/${id}/deny/`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
        "LeaveBalances",
      ],
    }),

    generateLeavePdf: builder.mutation<LeaveDocument, { id: number }>({
      query: ({ id }) => ({ url: `leave-applications/${id}/generate-pdf/`, method: "POST" }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Documents", id }, { type: "LeaveApplication", id }],
    }),

    getLeaveDocuments: builder.query<LeaveDocument[], number>({
      query: (id) => `leave-applications/${id}/documents/`,
      providesTags: (_result, _error, id) => [{ type: "Documents", id }],
    }),

    getLeaveAuditTrail: builder.query<AuditLogEntry[], number>({
      query: (id) => `leave-applications/${id}/audit-trail/`,
      providesTags: (_result, _error, id) => [{ type: "AuditTrail", id }],
    }),

    // Server-authoritative working-days calculation (excludes weekends).
    // Used for a labeled "preview" before/at submit time; the definitive
    // count is `total_working_days` on the saved application.
    previewWorkingDays: builder.mutation<{ working_days: number }, { start_date: string; last_date: string }>({
      query: ({ start_date, last_date }) => ({
        url: "working-days-preview/",
        method: "POST",
        body: { start_date, end_date: last_date },
      }),
    }),
  }),
});

export const {
  useGetLeaveApplicationsQuery,
  useGetLeaveApplicationQuery,
  useCreateLeaveApplicationMutation,
  useUpdateLeaveApplicationMutation,
  useSubmitLeaveApplicationMutation,
  useRecommendLeaveApplicationMutation,
  useCagReviewLeaveApplicationMutation,
  useCagRejectLeaveApplicationMutation,
  useReturnLeaveApplicationMutation,
  useVerifyLeaveApplicationMutation,
  useApproveLeaveApplicationMutation,
  useDenyLeaveApplicationMutation,
  useGenerateLeavePdfMutation,
  useGetLeaveDocumentsQuery,
  useLazyGetLeaveDocumentsQuery,
  useGetLeaveAuditTrailQuery,
  usePreviewWorkingDaysMutation,
} = leaveApi;
