import { baseApi } from "@/lib/api/baseApi";
import type {
  ApprovalDecision,
  AuditLogEntry,
  DashboardStats,
  LeaveApplication,
  LeaveApplicationListItem,
  LeaveDependant,
  LeaveDocument,
  PaginatedResponse,
  RecommendationDecision,
} from "@/types";

// TODO(api-confirm): All paths below assume the documented convention
// /api/leave-applications/... with workflow actions as POST sub-routes,
// e.g. /api/leave-applications/{id}/submit/. Confirm exact paths, body
// shapes and enum field names with the BACKEND agent, then update here.
// Everything else (components, hooks) consumes only the exported hooks
// below, so changes should stay localized to this file.

export interface LeaveApplicationListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  stage?: string;
  search?: string;
  department?: string;
}

interface CreateLeaveApplicationRequest {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason?: string;
  address?: string;
  contactPhone?: string;
  dependants?: LeaveDependant[];
  isDraft?: boolean;
}

type UpdateLeaveApplicationRequest = Partial<CreateLeaveApplicationRequest> & { id: number };

interface RecommendRequest {
  id: number;
  decision: RecommendationDecision;
  comments?: string;
  officerName?: string;
  officerDesignation?: string;
}

interface ReturnRequest {
  id: number;
  comments: string;
}

interface VerifyRequest {
  id: number;
  leaveBalanceDays?: number;
  balanceAfter?: number;
  comments?: string;
}

interface ApproveDenyRequest {
  id: number;
  decision: ApprovalDecision;
  travelAssistance?: boolean;
  reason?: string; // required when decision === "DENY"
}

function listTags(result?: PaginatedResponse<LeaveApplicationListItem>) {
  const items = result?.results ?? [];
  return [
    ...items.map((item) => ({ type: "LeaveApplication" as const, id: item.id })),
    { type: "LeaveApplications" as const, id: "LIST" },
  ];
}

export const leaveApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeaveApplications: builder.query<PaginatedResponse<LeaveApplicationListItem>, LeaveApplicationListParams | void>({
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

    createLeaveApplication: builder.mutation<LeaveApplication, CreateLeaveApplicationRequest>({
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
      query: ({ id }) => ({
        url: `leave-applications/${id}/submit/`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    recommendLeaveApplication: builder.mutation<LeaveApplication, RecommendRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/recommend/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    returnLeaveApplication: builder.mutation<LeaveApplication, ReturnRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/return/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    verifyLeaveApplication: builder.mutation<LeaveApplication, VerifyRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/verify/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    approveLeaveApplication: builder.mutation<LeaveApplication, ApproveDenyRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/approve/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    denyLeaveApplication: builder.mutation<LeaveApplication, ApproveDenyRequest>({
      query: ({ id, ...body }) => ({
        url: `leave-applications/${id}/deny/`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeaveApplication", id },
        { type: "LeaveApplications", id: "LIST" },
        "Dashboard",
      ],
    }),

    generateLeavePdf: builder.mutation<{ url: string }, { id: number }>({
      query: ({ id }) => ({
        url: `leave-applications/${id}/pdf/`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Documents", id }],
    }),

    getLeaveDocuments: builder.query<LeaveDocument[], number>({
      query: (id) => `leave-applications/${id}/documents/`,
      providesTags: (_result, _error, id) => [{ type: "Documents", id }],
    }),

    getLeaveAuditTrail: builder.query<AuditLogEntry[], number>({
      query: (id) => `leave-applications/${id}/audit-trail/`,
      providesTags: (_result, _error, id) => [{ type: "AuditTrail", id }],
    }),

    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => "leave-applications/dashboard-stats/",
      providesTags: ["Dashboard"],
    }),

    // Client-side preview only — replicates simple weekday math when the
    // backend calculator is unavailable. Prefer this endpoint when reachable
    // since it accounts for gazetted holidays.
    previewWorkingDays: builder.query<{ workingDays: number }, { startDate: string; endDate: string; leaveTypeId?: number }>({
      query: (params) => ({
        url: "leave-applications/working-days-preview/",
        params,
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
  useReturnLeaveApplicationMutation,
  useVerifyLeaveApplicationMutation,
  useApproveLeaveApplicationMutation,
  useDenyLeaveApplicationMutation,
  useGenerateLeavePdfMutation,
  useGetLeaveDocumentsQuery,
  useGetLeaveAuditTrailQuery,
  useGetDashboardStatsQuery,
  useLazyPreviewWorkingDaysQuery,
} = leaveApi;
