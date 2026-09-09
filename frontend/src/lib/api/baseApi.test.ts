import { makeStore } from "@/store";
import { leaveApi } from "@/features/leave/leaveApi";
import { selectAccessToken, selectIsAuthenticated } from "@/store/slices/authSlice";
import type { LeaveApplication } from "@/types";

// Exercises baseApi.ts's `baseQueryWithReauth` wrapper: a 401 should trigger
// exactly one `POST /api/auth/refresh/` attempt, then retry the original
// request with the new token on success; a failed refresh should log the
// user out instead of looping.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sampleApplication(id: number): LeaveApplication {
  return {
    id,
    employee: 1,
    full_name: "Jane Doe",
    designation: "Officer",
    station: "HQ",
    division_department: "IT",
    leave_type: 1,
    travel_assistance: false,
    start_date: "2026-01-01",
    last_date: "2026-01-05",
    dependants: [],
    status: "DRAFT",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("baseApi token-refresh-on-401", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retries the original request with the new token after a successful refresh, calling fetch exactly 3 times", async () => {
    const store = makeStore({
      user: null,
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      isAuthenticated: true,
    });

    const fetchMock = jest.fn();
    // 1st call: the original request -> 401
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "token expired" }, 401));
    // 2nd call: the refresh request -> new access token
    fetchMock.mockResolvedValueOnce(jsonResponse({ access: "new-token" }, 200));
    // 3rd call: the retried original request -> succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse(sampleApplication(7), 200));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await store.dispatch(leaveApi.endpoints.getLeaveApplication.initiate(7));

    expect(result.data).toEqual(sampleApplication(7));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const refreshRequest = fetchMock.mock.calls[1][0] as Request;
    expect(refreshRequest.url).toContain("/api/auth/refresh/");
    expect(JSON.parse(await refreshRequest.text())).toEqual({ refresh: "refresh-token" });

    const retryRequest = fetchMock.mock.calls[2][0] as Request;
    expect(retryRequest.headers.get("Authorization")).toBe("Bearer new-token");

    // Store should now hold the refreshed token and stay authenticated.
    expect(selectAccessToken(store.getState())).toBe("new-token");
    expect(selectIsAuthenticated(store.getState())).toBe(true);
  });

  it("attempts exactly one refresh and logs out (without looping) when the refresh call itself fails", async () => {
    const store = makeStore({
      user: null,
      accessToken: "expired-token",
      refreshToken: "stale-refresh-token",
      isAuthenticated: true,
    });

    const fetchMock = jest.fn();
    // 1st call: the original request -> 401
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "token expired" }, 401));
    // 2nd call: the refresh request itself also fails
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "invalid refresh token" }, 401));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await store.dispatch(leaveApi.endpoints.getLeaveApplication.initiate(7));

    expect(result.error).toBeDefined();
    // Exactly the original request + one refresh attempt — no retry, no loop.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
  });

  it("logs out immediately on a 401 with no refresh token available, without calling the refresh endpoint", async () => {
    const store = makeStore({
      user: null,
      accessToken: "expired-token",
      refreshToken: null,
      isAuthenticated: true,
    });

    const fetchMock = jest.fn().mockResolvedValueOnce(jsonResponse({ detail: "token expired" }, 401));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await store.dispatch(leaveApi.endpoints.getLeaveApplication.initiate(7));

    expect(result.error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
  });
});
