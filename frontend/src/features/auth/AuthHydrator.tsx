"use client";

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials, setUser } from "@/store/slices/authSlice";
import { loadTokens } from "@/lib/auth/tokenStorage";
import { useMeQuery } from "@/features/auth/authApi";

// Rehydrates the Redux auth state from localStorage-persisted JWTs on first
// client render, then fetches the current user profile. Renders nothing.
export function AuthHydrator() {
  const dispatch = useAppDispatch();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const { accessToken, refreshToken } = loadTokens();
    if (accessToken) {
      dispatch(setCredentials({ accessToken, refreshToken, user: null }));
    }
    setHydrated(true);
  }, [dispatch]);

  return hydrated ? <MeSync /> : null;
}

function MeSync() {
  const { data: user } = useMeQuery();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (user) {
      dispatch(setUser(user));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return null;
}
