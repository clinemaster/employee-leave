import { baseApi } from "@/lib/api/baseApi";
import type { LeavePolicy, PaginatedResponse, TravelPaymentSettings } from "@/types";

// GET|POST /api/leave-policies/, GET|PUT|PATCH|DELETE /api/leave-policies/{id}/
// SYSTEM_ADMIN only (read and write; 403 for everyone else, including
// HR_ADMIN). Filter: ?leave_type=&is_active=. Matches /API.md field names
// exactly (LeavePolicySerializer).
export interface LeavePolicyParams {
  leave_type?: number;
  is_active?: boolean;
}

export const policiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeavePolicies: builder.query<LeavePolicy[], LeavePolicyParams | void>({
      query: (params) => ({ url: "leave-policies/", params: params ?? undefined }),
      transformResponse: (response: LeavePolicy[] | PaginatedResponse<LeavePolicy>) =>
        Array.isArray(response) ? response : response.results,
      providesTags: (result) =>
        result
          ? [
              ...result.map((p) => ({ type: "LeavePolicies" as const, id: p.id })),
              { type: "LeavePolicies" as const, id: "LIST" },
            ]
          : [{ type: "LeavePolicies" as const, id: "LIST" }],
    }),
    getLeavePolicy: builder.query<LeavePolicy, number>({
      query: (id) => `leave-policies/${id}/`,
      providesTags: (_result, _error, id) => [{ type: "LeavePolicies", id }],
    }),
    createLeavePolicy: builder.mutation<LeavePolicy, Partial<LeavePolicy>>({
      query: (body) => ({ url: "leave-policies/", method: "POST", body }),
      invalidatesTags: [{ type: "LeavePolicies", id: "LIST" }],
    }),
    updateLeavePolicy: builder.mutation<LeavePolicy, Partial<LeavePolicy> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `leave-policies/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeavePolicies", id },
        { type: "LeavePolicies", id: "LIST" },
      ],
    }),
    deleteLeavePolicy: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `leave-policies/${id}/`, method: "DELETE" }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "LeavePolicies", id },
        { type: "LeavePolicies", id: "LIST" },
      ],
    }),

    // Singleton — GET/PUT /api/travel-payment-settings/. Any authenticated
    // user may read (the employee-facing form needs the caps to warn live);
    // only SYSTEM_ADMIN (CanManageLeavePolicies) may write.
    getTravelPaymentSettings: builder.query<TravelPaymentSettings, void>({
      query: () => "travel-payment-settings/",
      providesTags: ["TravelPaymentSettings"],
    }),
    updateTravelPaymentSettings: builder.mutation<TravelPaymentSettings, Partial<TravelPaymentSettings>>({
      query: (body) => ({ url: "travel-payment-settings/", method: "PUT", body }),
      invalidatesTags: ["TravelPaymentSettings"],
    }),
  }),
});

export const {
  useGetLeavePoliciesQuery,
  useGetLeavePolicyQuery,
  useCreateLeavePolicyMutation,
  useUpdateLeavePolicyMutation,
  useDeleteLeavePolicyMutation,
  useGetTravelPaymentSettingsQuery,
  useUpdateTravelPaymentSettingsMutation,
} = policiesApi;
