import { baseApi } from "@/lib/api/baseApi";
import type { Holiday, LeaveType } from "@/types";

// Leave types + holidays — read: any authenticated user, write: SYSTEM_ADMIN
// only (enforced server-side). Matches /API.md field names exactly.
export const catalogApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeaveTypes: builder.query<LeaveType[], void>({
      query: () => "leave-types/",
      providesTags: ["LeaveTypes"],
      transformResponse: (response: LeaveType[] | { results: LeaveType[] }) =>
        Array.isArray(response) ? response : response.results,
    }),
    createLeaveType: builder.mutation<LeaveType, Partial<LeaveType>>({
      query: (body) => ({ url: "leave-types/", method: "POST", body }),
      invalidatesTags: ["LeaveTypes"],
    }),
    updateLeaveType: builder.mutation<LeaveType, Partial<LeaveType> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `leave-types/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["LeaveTypes"],
    }),
    deactivateLeaveType: builder.mutation<LeaveType, { id: number }>({
      query: ({ id }) => ({ url: `leave-types/${id}/`, method: "PATCH", body: { is_active: false } }),
      invalidatesTags: ["LeaveTypes"],
    }),
    activateLeaveType: builder.mutation<LeaveType, { id: number }>({
      query: ({ id }) => ({ url: `leave-types/${id}/`, method: "PATCH", body: { is_active: true } }),
      invalidatesTags: ["LeaveTypes"],
    }),
    // POST /api/leave-types/reorder/ — bulk sort_order update in one atomic
    // request, replacing the earlier sequential-PATCH workaround.
    reorderLeaveTypes: builder.mutation<LeaveType[], { id: number; sort_order: number }[]>({
      query: (body) => ({ url: "leave-types/reorder/", method: "POST", body }),
      invalidatesTags: ["LeaveTypes"],
    }),
    getHolidays: builder.query<Holiday[], void>({
      query: () => "holidays/",
      providesTags: ["Holidays"],
      transformResponse: (response: Holiday[] | { results: Holiday[] }) =>
        Array.isArray(response) ? response : response.results,
    }),
    createHoliday: builder.mutation<Holiday, Partial<Holiday>>({
      query: (body) => ({ url: "holidays/", method: "POST", body }),
      invalidatesTags: ["Holidays"],
    }),
    updateHoliday: builder.mutation<Holiday, Partial<Holiday> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `holidays/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["Holidays"],
    }),
    deleteHoliday: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({ url: `holidays/${id}/`, method: "DELETE" }),
      invalidatesTags: ["Holidays"],
    }),
  }),
});

export const {
  useGetLeaveTypesQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeactivateLeaveTypeMutation,
  useActivateLeaveTypeMutation,
  useReorderLeaveTypesMutation,
  useGetHolidaysQuery,
  useCreateHolidayMutation,
  useUpdateHolidayMutation,
  useDeleteHolidayMutation,
} = catalogApi;
