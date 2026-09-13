import { baseApi } from "@/lib/api/baseApi";

// GET /api/dashboard-stats/ — role-scoped counts (see /API.md "Dashboard
// stats"). Shape depends on the caller's role; callers should read the
// fields relevant to the current user's role from `DashboardStats` (all
// optional since only one role's subset is ever populated per response).
export interface DashboardStats {
  // EMPLOYEE
  draft?: number;
  pending?: number;
  approved?: number;
  denied?: number;
  returned?: number;
  // HOD/HOS/HOU
  pending_recommendation?: number;
  recommended?: number;
  completed?: number;
  // HR_ADMIN
  pending_verification?: number;
  verified?: number;
  // AUTHORIZING_OFFICER
  pending_authorization?: number;
  // SYSTEM_ADMIN
  in_progress?: number;
  archived?: number;
  total_applications?: number;
  applications_by_leave_type?: { leave_type: string; count: number }[];
  applications_by_department?: { department: string; count: number }[];
  applications_by_work_station?: { work_station: string; count: number }[];
  average_processing_time_hours?: number | null;
}

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => "dashboard-stats/",
      providesTags: ["Dashboard"],
    }),
  }),
});

export const { useGetDashboardStatsQuery } = dashboardApi;
