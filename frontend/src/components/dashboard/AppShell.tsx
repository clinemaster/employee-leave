"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import { logout } from "@/store/slices/authSlice";
import { clearTokens } from "@/lib/auth/tokenStorage";
import { Button } from "@/components/ui/Button";
import { RoleGuard } from "@/components/workflow/RoleGuard";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { allUserRoles } from "@/types";

const navByRole: Record<string, { label: string; href: string }[]> = {
  EMPLOYEE: [
    { label: "My Applications", href: "/employee/applications" },
    { label: "New Leave Application", href: "/employee/leave/new" },
  ],
  HEAD_OF_DEPARTMENT: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  DAG: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  HEAD_OF_SECTION: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  HR_ADMIN: [
    { label: "Review Queue", href: "/hr/review-queue" },
    { label: "Applications", href: "/hr/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  AUTHORIZING_OFFICER: [
    { label: "Review Queue", href: "/authorization/review-queue" },
    { label: "Applications", href: "/authorization/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  CAG: [
    { label: "CAG Review Queue", href: "/cag/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  AAG: [
    { label: "AAG Review Queue", href: "/aag/applications" },
    { label: "My Applications", href: "/employee/applications" },
  ],
  CHIEF_ACCOUNTANT: [
    { label: "My Applications", href: "/employee/applications" },
  ],
  DAHRM: [
    { label: "My Applications", href: "/employee/applications" },
  ],
  ADA: [
    { label: "My Applications", href: "/employee/applications" },
  ],
  CHIEF_EXTERNAL_AUDITOR: [
    { label: "My Applications", href: "/employee/applications" },
  ],
  SYSTEM_ADMIN: [
    { label: "Leave Types", href: "/admin/leave-types" },
    { label: "Leave Policies", href: "/admin/leave-policies" },
    { label: "Person Types", href: "/admin/person-types" },
    { label: "Users", href: "/admin/users" },
    { label: "Organization", href: "/admin/organization" },
    { label: "Reports", href: "/admin/reports" },
    { label: "My Applications", href: "/employee/applications" },
  ],
};

function dedupeByHref(items: { label: string; href: string }[]) {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.href) ? false : (seen.add(item.href), true)));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const navItems = user
    ? [
        ...dedupeByHref(allUserRoles(user).flatMap((r) => navByRole[r] ?? [])),
        ...(allUserRoles(user).includes("SYSTEM_ADMIN")
          ? [{ label: "Settings", href: "/settings" }]
          : []),
      ]
    : [];

  function handleLogout() {
    clearTokens();
    dispatch(logout());
    router.replace("/login");
  }

  return (
    <RoleGuard>
      <div className="flex min-h-screen bg-gray-50">
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white p-4">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">NAOT Leave</h2>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium",
                  pathname.startsWith(item.href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <span className="text-sm text-gray-500">
              {user ? `${user.full_name} · ${user.role.replaceAll("_", " ")}` : ""}
            </span>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Button variant="secondary" onClick={handleLogout}>
                Log out
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
