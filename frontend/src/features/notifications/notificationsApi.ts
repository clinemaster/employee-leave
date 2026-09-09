import { baseApi } from "@/lib/api/baseApi";
import type { NotificationItem, PaginatedResponse } from "@/types";

// Matches /API.md "Notifications" section.
export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<NotificationItem[], { is_read?: boolean } | void>({
      query: (params) => ({ url: "notifications/", params: params ?? undefined }),
      transformResponse: (response: NotificationItem[] | PaginatedResponse<NotificationItem>) =>
        Array.isArray(response) ? response : response.results,
      providesTags: (result) =>
        result
          ? [
              ...result.map((n) => ({ type: "Notifications" as const, id: n.id })),
              { type: "Notifications" as const, id: "LIST" },
            ]
          : [{ type: "Notifications" as const, id: "LIST" }],
    }),
    markNotificationRead: builder.mutation<NotificationItem, { id: number }>({
      query: ({ id }) => ({ url: `notifications/${id}/read/`, method: "POST" }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Notifications", id },
        { type: "Notifications", id: "LIST" },
      ],
    }),
    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: "notifications/mark-all-read/", method: "POST" }),
      invalidatesTags: [{ type: "Notifications", id: "LIST" }],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
