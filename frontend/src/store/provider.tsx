"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";

// Deliberately does NOT read localStorage here. A lazy useState initializer
// runs during render, including the client's first (pre-hydration) render —
// reading a browser-only API there would return different results between
// the server render and that first client pass and break hydration. Token
// loading happens after mount instead, in AuthHydrator's effect.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => makeStore());

  return <Provider store={store}>{children}</Provider>;
}
