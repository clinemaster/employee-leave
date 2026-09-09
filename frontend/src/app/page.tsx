"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser, selectIsAuthenticated } from "@/features/auth/selectors";
import { roleHomeRoute } from "@/lib/permissions";

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectCurrentUser);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    } else {
      router.replace(user ? roleHomeRoute[user.role] : "/dashboard");
    }
  }, [isAuthenticated, user, router]);

  return null;
}
