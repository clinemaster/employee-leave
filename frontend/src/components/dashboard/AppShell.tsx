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

const navByRole: Record<string, { label: string; href: string }[]> = {
  EMPLOYEE: [
    { label: "My Applications", href: "/employee/applications" },
    { label: "New Leave Application", href: "/employee/leave/new" },
  ],
  HOD: [{ label: "Applications", href: "/hod/applications" }],
  HR: [{ label: "Applications", href: "/hr/applications" }],
  AUTHORIZING_OFFICER: [{ label: "Applications", href: "/authorization/applications" }],
  ADMIN: [
    { label: "Leave Types", href: "/admin/leave-types" },
    { label: "Holidays", href: "/admin/holidays" },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const navItems = user ? navByRole[user.role] ?? [] : [];

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
              {user ? `${user.fullName} · ${user.role.replaceAll("_", " ")}` : ""}
            </span>
            <Button variant="secondary" onClick={handleLogout}>
              Log out
            </Button>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
