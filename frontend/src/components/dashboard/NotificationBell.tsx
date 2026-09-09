"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/features/notifications/notificationsApi";

// Bell + dropdown wired to GET /api/notifications/ and the read/mark-all-read
// actions (see /API.md "Notifications"). Polls lightly via RTK Query's
// default caching; no websocket/push channel is documented, so this is
// poll-on-open only (no background interval, to avoid unnecessary load).
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications, isLoading } = useGetNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: isMarkingAll }] = useMarkAllNotificationsReadMutation();

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-gray-600 hover:bg-gray-100"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
                disabled={isMarkingAll || unreadCount === 0}
                onClick={() => markAllRead()}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <p className="p-3 text-xs text-gray-500">Loading...</p>
              ) : !notifications || notifications.length === 0 ? (
                <p className="p-3 text-xs text-gray-500">No notifications.</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={clsx(
                      "border-b border-gray-50 px-3 py-2 text-xs last:border-b-0",
                      !n.is_read && "bg-blue-50"
                    )}
                  >
                    <p className="text-gray-800">{n.message}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        {n.related_application ? (
                          <Link
                            href={`/employee/applications/${n.related_application}`}
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        ) : null}
                        {!n.is_read ? (
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => markRead({ id: n.id })}
                          >
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
