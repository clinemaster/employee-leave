import { render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { loadTokens } from "@/lib/auth/tokenStorage";
import { selectCurrentUser, selectIsAuthenticated } from "@/store/slices/authSlice";
import { AuthHydrator } from "./AuthHydrator";
import type { User } from "@/types";

// AuthHydrator itself only reads the access token from Redux (already
// preloaded into the store from localStorage by store/provider.tsx's lazy
// initializer via `loadTokens()`) and, if present, fetches `GET
// /api/users/me/` to fill in the full user object. These tests exercise both
// halves: that `loadTokens()` correctly reads/omits localStorage, and that
// the hydrator itself behaves correctly given a preloaded token (present,
// absent, or the request failing outright for a malformed/expired token).

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const mockUser: User = {
  id: 1,
  username: "jdoe",
  full_name: "Jane Doe",
  email: "jdoe@example.com",
  role: "EMPLOYEE",
  is_active: true,
};

describe("tokenStorage.loadTokens (localStorage rehydration)", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("reads persisted tokens from localStorage when present", () => {
    window.localStorage.setItem("naot_access_token", "access-123");
    window.localStorage.setItem("naot_refresh_token", "refresh-456");

    expect(loadTokens()).toEqual({ accessToken: "access-123", refreshToken: "refresh-456" });
  });

  it("returns nulls when no token is stored", () => {
    expect(loadTokens()).toEqual({ accessToken: null, refreshToken: null });
  });
});

describe("AuthHydrator", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("populates the full user object when a valid token is preloaded", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(mockUser)) as unknown as typeof fetch;

    const store = makeStore({ user: null, accessToken: "valid-token", refreshToken: null, isAuthenticated: true });
    render(
      <Provider store={store}>
        <AuthHydrator />
      </Provider>
    );

    await waitFor(() => expect(selectCurrentUser(store.getState())).toEqual(mockUser));
    expect(selectIsAuthenticated(store.getState())).toBe(true);
  });

  it("does not call /users/me/ and stays unauthenticated when no token is present", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(mockUser)) as unknown as typeof fetch;

    const store = makeStore(); // no preloaded auth -> accessToken: null
    render(
      <Provider store={store}>
        <AuthHydrator />
      </Provider>
    );

    // RTK Query's `skip: !accessToken` should prevent any request from firing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(selectCurrentUser(store.getState())).toBeNull();
    expect(selectIsAuthenticated(store.getState())).toBe(false);
  });

  it("handles a malformed/expired token gracefully (401) without crashing or populating user", async () => {
    // Simulate an expired/invalid access token with no refresh token to fall
    // back on: baseApi's reauth wrapper should log the user out rather than
    // throw, and the hydrator should render nothing regardless.
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ detail: "Invalid token" }, 401)) as unknown as typeof fetch;

    const store = makeStore({ user: null, accessToken: "expired-token", refreshToken: null, isAuthenticated: true });

    expect(() =>
      render(
        <Provider store={store}>
          <AuthHydrator />
        </Provider>
      )
    ).not.toThrow();

    await waitFor(() => expect(selectIsAuthenticated(store.getState())).toBe(false));
    expect(selectCurrentUser(store.getState())).toBeNull();
  });
});
