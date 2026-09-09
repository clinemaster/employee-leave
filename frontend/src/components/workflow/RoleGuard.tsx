"use client";

// UX-only route guard. Redirects unauthenticated users to /login and
// restricts each role's routes based on `routeRoleMap`. The backend API is
// the real enforcement layer (RBAC on every endpoint) — this component only
// prevents an authenticated-but-wrong-role user from seeing a UI they can't
// act on, and prevents flicker of protected content pre-redirect.

import { type ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser, selectIsAuthenticated } from "@/features/auth/selectors";
import { routeRoleMap } from "@/lib/permissions";

export function RoleGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const rule = routeRoleMap.find((r) => pathname.startsWith(r.prefix));
    if (rule && user && !rule.roles.includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, user, pathname, router]);

  if (!isAuthenticated) return null;

  const rule = routeRoleMap.find((r) => pathname.startsWith(r.prefix));
  if (rule && user && !rule.roles.includes(user.role)) return null;

  return <>{children}</>;
}
