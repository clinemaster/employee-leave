import { baseApi } from "@/lib/api/baseApi";
import type { LeaveBalance, PaginatedResponse } from "@/types";

// GET /api/leave-balances/ — employees see only their own; HR_ADMIN,
// AUTHORIZING_OFFICER, SYSTEM_ADMIN see all. Filter: ?employee=&leave_type=&period=
export interface LeaveBalanceParams {
  employee?: number;
  leave_type?: number;
  period?: string;
}

export const balancesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeaveBalances: builder.query<LeaveBalance[], LeaveBalanceParams | void>({
      query: (params) => ({ url: "leave-balances/", params: params ?? undefined }),
      transformResponse: (response: LeaveBalance[] | PaginatedResponse<LeaveBalance>) =>
        Array.isArray(response) ? response : response.results,
      providesTags: ["LeaveBalances"],
    }),
  }),
});

export const { useGetLeaveBalancesQuery } = balancesApi;
