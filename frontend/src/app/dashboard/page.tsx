"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import { roleHomeRoute } from "@/lib/permissions";
import { AppShell } from "@/components/dashboard/AppShell";

// Generic landing page; immediately redirects to the role's home route.
// Kept as a real route so links/redirects to "/dashboard" always resolve.
export default function DashboardPage() {
  const router = useRouter();
  const user = useAppSelector(selectCurrentUser);

  useEffect(() => {
    if (user) router.replace(roleHomeRoute[user.role]);
  }, [user, router]);

  return (
    <AppShell>
      <p className="text-sm text-gray-500">Loading your dashboard...</p>
    </AppShell>
  );
}
