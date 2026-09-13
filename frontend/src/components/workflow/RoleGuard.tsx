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
import { selectAuthHydrated } from "@/store/slices/authSlice";
import { routeRoleMap } from "@/lib/permissions";
import { allUserRoles } from "@/types";

export function RoleGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);
  // False on the server and on the client's first render (see
  // store/provider.tsx / AuthHydrator) — both render nothing until this
  // flips true, so server and client markup always match, and a
  // logged-in user isn't bounced to /login before their token loads.
  const hydrated = useAppSelector(selectAuthHydrated);

  useEffect(() => {
    if (!hydrated) return;

    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const rule = routeRoleMap.find((r) => pathname.startsWith(r.prefix));
    if (rule && user && !allUserRoles(user).some((r) => rule.roles.includes(r))) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthenticated, user, pathname, router]);

  if (!hydrated || !isAuthenticated) return null;

  const rule = routeRoleMap.find((r) => pathname.startsWith(r.prefix));
  if (rule && user && !allUserRoles(user).some((r) => rule.roles.includes(r))) return null;

  return <>{children}</>;
}
