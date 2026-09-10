"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser, hydrateFromStorage, selectAccessToken, selectAuthHydrated } from "@/store/slices/authSlice";
import { useMeQuery } from "@/features/auth/authApi";
import { loadTokens } from "@/lib/auth/tokenStorage";

// Two-step, client-only auth bootstrap:
//  1. On mount, read persisted tokens from localStorage and dispatch them
//     (never during render — see store/provider.tsx — so the server render
//     and the client's first render both start from the same unauthenticated
//     state and hydration matches).
//  2. Once a token is in the store, fetch the current user profile.
// Renders nothing.
export function AuthHydrator() {
  const hydrated = useAppSelector(selectAuthHydrated);
  const accessToken = useAppSelector(selectAccessToken);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!hydrated) {
      const { accessToken: storedAccess, refreshToken: storedRefresh } = loadTokens();
      dispatch(hydrateFromStorage({ accessToken: storedAccess, refreshToken: storedRefresh }));
    }
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: user } = useMeQuery(undefined, { skip: !accessToken });

  useEffect(() => {
    if (user) dispatch(setUser(user));
  }, [user, dispatch]);

  return null;
}
