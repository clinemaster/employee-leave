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

// Shared by every role, always first, in this exact order — every role can
// be a leave applicant regardless of any reviewer responsibilities, so
// these three don't belong to any one role's array below.
const COMMON_PREFIX: { label: string; href: string }[] = [
  { label: "Personal Information", href: "/employee/personal-information" },
  { label: "New Leave Application", href: "/employee/leave/new" },
  { label: "My Applications", href: "/employee/applications" },
];

const navByRole: Record<string, { label: string; href: string }[]> = {
  EMPLOYEE: [],
  HEAD_OF_DEPARTMENT: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
  ],
  DAG: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
  ],
  HEAD_OF_SECTION: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
  ],
  HR_ADMIN: [
    { label: "Review Queue", href: "/hr/review-queue" },
    { label: "Applications", href: "/hr/applications" },
  ],
  AUTHORIZING_OFFICER: [
    { label: "Review Queue", href: "/authorization/review-queue" },
    { label: "Applications", href: "/authorization/applications" },
  ],
  CAG: [
    { label: "CAG Review Queue", href: "/cag/applications" },
  ],
  AAG: [
    { label: "AAG Review Queue", href: "/aag/applications" },
  ],
  CHIEF_ACCOUNTANT: [],
  DAHRM: [],
  ADA: [],
  CHIEF_EXTERNAL_AUDITOR: [
    { label: "Review Queue", href: "/hod/review-queue" },
    { label: "Recommendations", href: "/hod/applications" },
  ],
  SYSTEM_ADMIN: [
    { label: "Roles", href: "/admin/roles" },
    { label: "Leave Types", href: "/admin/leave-types" },
    { label: "Leave Policies", href: "/admin/leave-policies" },
    { label: "Person Types", href: "/admin/person-types" },
    { label: "Users", href: "/admin/users" },
    { label: "Organization", href: "/admin/organization" },
    { label: "Reports", href: "/admin/reports" },
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
        ...COMMON_PREFIX,
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
              {user ? (
                <>
                  Welcome{" "}
                  <span className="font-medium uppercase text-gray-900">{user.full_name}</span>
                </>
              ) : (
                ""
              )}
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
