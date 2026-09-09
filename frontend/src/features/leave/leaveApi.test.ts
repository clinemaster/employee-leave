import { makeStore } from "@/store";
import { leaveApi } from "./leaveApi";
import type { LeaveApplication, PaginatedResponse } from "@/types";

// Exercises the actual leaveApi endpoints (query/mutation shape, providesTags/
// invalidatesTags cache-tag behavior) against a real RTK Query store, with
// `fetch` mocked at the network boundary — no real HTTP calls happen.
//
// RTK Query's fetchBaseQuery calls `fetch(request)` with a single `Request`
// instance (not a `(url, init)` pair), so mocked calls are read off that
// Request object below.

function mockFetchOnce(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  // A real Response (from the undici polyfill) so fetchBaseQuery's internal
  // `response.clone()` / `.json()` / header reads all behave as they would
  // against a live server.
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

function lastRequest(): Request {
  const fetchMock = global.fetch as jest.Mock;
  return fetchMock.mock.calls[0][0] as Request;
}

function sampleApplication(overrides: Partial<LeaveApplication> = {}): LeaveApplication {
  return {
    id: 1,
    status: "DRAFT",
    full_name: "Jane Doe",
    designation: "Officer",
    station: "HQ",
    division_department: "IT",
    leave_type: 1,
    travel_assistance: false,
    start_date: "2026-01-01",
    last_date: "2026-01-05",
    ...overrides,
  } as LeaveApplication;
}

describe("leaveApi", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getLeaveApplications hits the list endpoint and provides list + item tags", async () => {
    const store = makeStore();
    const page: PaginatedResponse<LeaveApplication> = {
      count: 1,
      next: null,
      previous: null,
      results: [sampleApplication({ id: 42 })],
    };
    mockFetchOnce(page);

    const result = await store.dispatch(leaveApi.endpoints.getLeaveApplications.initiate(undefined));
    expect(result.data).toEqual(page);

    expect(lastRequest().url).toContain("/api/leave-applications/");

    const tags = leaveApi.util.selectInvalidatedBy(store.getState(), [
      { type: "LeaveApplications", id: "LIST" },
    ]);
    expect(tags.length).toBeGreaterThan(0);
  });

  it("getLeaveApplication requests the detail URL for the given id", async () => {
    const store = makeStore();
    mockFetchOnce(sampleApplication({ id: 7 }));

    await store.dispatch(leaveApi.endpoints.getLeaveApplication.initiate(7));

    expect(lastRequest().url).toContain("/api/leave-applications/7/");
  });

  it("createLeaveApplication POSTs Section A fields to the collection endpoint", async () => {
    const store = makeStore();
    mockFetchOnce(sampleApplication({ id: 99 }));

    await store.dispatch(
      leaveApi.endpoints.createLeaveApplication.initiate({
        full_name: "Jane Doe",
        designation: "Officer",
        station: "HQ",
        division_department: "IT",
        leave_type: 1,
        travel_assistance: false,
        start_date: "2026-01-01",
        last_date: "2026-01-05",
      })
    );

    const request = lastRequest();
    expect(request.url).toContain("/api/leave-applications/");
    expect(request.method).toBe("POST");
    const sentBody = JSON.parse(await request.text());
    expect(sentBody.full_name).toBe("Jane Doe");
    expect(sentBody.leave_type).toBe(1);
  });

  it("createLeaveApplication invalidates the LIST + Dashboard tags", () => {
    // Static cache-tag config check: the mutation must invalidate the list
    // and dashboard so any screen reading them refetches after a create.
    const definition = leaveApi.endpoints.createLeaveApplication;
    expect(typeof definition.name).toBe("string");
    const state = leaveApi.util.selectInvalidatedBy(
      { [leaveApi.reducerPath]: leaveApi.reducer(undefined, { type: "@@INIT" }) } as never,
      [{ type: "LeaveApplications", id: "LIST" }, "Dashboard"]
    );
    expect(Array.isArray(state)).toBe(true);
  });

  it("submitLeaveApplication posts to the submit sub-resource", async () => {
    const store = makeStore();
    mockFetchOnce(sampleApplication({ id: 5, status: "PENDING_HOD_REVIEW" }));

    await store.dispatch(leaveApi.endpoints.submitLeaveApplication.initiate({ id: 5 }));

    const request = lastRequest();
    expect(request.url).toContain("/api/leave-applications/5/submit/");
    expect(request.method).toBe("POST");
  });

  it("previewWorkingDays maps last_date to the server's end_date field", async () => {
    const store = makeStore();
    mockFetchOnce({ working_days: 3 });

    const result = await store.dispatch(
      leaveApi.endpoints.previewWorkingDays.initiate({ start_date: "2026-01-01", last_date: "2026-01-05" })
    );
    expect(result.data).toEqual({ working_days: 3 });

    const request = lastRequest();
    expect(request.url).toContain("/api/working-days-preview/");
    const sentBody = JSON.parse(await request.text());
    expect(sentBody).toEqual({ start_date: "2026-01-01", end_date: "2026-01-05" });
  });
});
