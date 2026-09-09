"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser } from "@/store/slices/authSlice";
import { selectAccessToken } from "@/store/slices/authSlice";
import { useMeQuery } from "@/features/auth/authApi";

// Fetches the current user profile once the store has been preloaded with a
// persisted access token (see store/provider.tsx). Renders nothing.
export function AuthHydrator() {
  const accessToken = useAppSelector(selectAccessToken);
  const { data: user } = useMeQuery(undefined, { skip: !accessToken });
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (user) dispatch(setUser(user));
  }, [user, dispatch]);

  return null;
}
