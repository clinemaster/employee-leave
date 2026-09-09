"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { loadTokens } from "@/lib/auth/tokenStorage";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    const { accessToken, refreshToken } = loadTokens();
    return makeStore(
      accessToken ? { user: null, accessToken, refreshToken, isAuthenticated: true } : undefined
    );
  });

  return <Provider store={store}>{children}</Provider>;
}
