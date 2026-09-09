import { makeStore } from "@/store";
import { policiesApi } from "./policiesApi";
import type { LeavePolicy } from "@/types";

// Exercises policiesApi's endpoints (query/mutation shape, tag invalidation)
// against a real RTK Query store, `fetch` mocked at the network boundary —
// matches the pattern in leaveApi.test.ts.

function mockFetchOnce(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  // A 204 (No Content) response must have a null body — the Response
  // constructor throws otherwise.
  const responseBody = status === 204 ? null : JSON.stringify(body);
  global.fetch = jest.fn().mockResolvedValue(
    new Response(responseBody, {
      status,
      headers: status === 204 ? undefined : { "content-type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

function lastRequest(): Request {
  const fetchMock = global.fetch as jest.Mock;
  return fetchMock.mock.calls[0][0] as Request;
}

function samplePolicy(overrides: Partial<LeavePolicy> = {}): LeavePolicy {
  return {
    id: 1,
    leave_type: 2,
    leave_type_name: "Annual Leave",
    min_years_of_service: null,
    max_years_of_service: null,
    annual_entitlement: 28,
    is_active: true,
    sort_order: 1,
    ...overrides,
  };
}

describe("policiesApi", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getLeavePolicies hits the list endpoint and provides list + item tags", async () => {
    const store = makeStore();
    mockFetchOnce([samplePolicy({ id: 5 })]);

    const result = await store.dispatch(policiesApi.endpoints.getLeavePolicies.initiate());
    expect(result.data).toEqual([samplePolicy({ id: 5 })]);
    expect(lastRequest().url).toContain("/api/leave-policies/");

    const tags = policiesApi.util.selectInvalidatedBy(store.getState(), [
      { type: "LeavePolicies", id: "LIST" },
    ]);
    expect(tags.length).toBeGreaterThan(0);
  });

  it("getLeavePolicies unwraps a paginated {results} response", async () => {
    const store = makeStore();
    mockFetchOnce({ count: 1, next: null, previous: null, results: [samplePolicy()] });

    const result = await store.dispatch(policiesApi.endpoints.getLeavePolicies.initiate());
    expect(result.data).toEqual([samplePolicy()]);
  });

  it("createLeavePolicy POSTs to leave-policies/ with the given body", async () => {
    const store = makeStore();
    mockFetchOnce(samplePolicy({ id: 9 }));

    const body = {
      leave_type: 2,
      min_years_of_service: 0,
      max_years_of_service: 5,
      annual_entitlement: 21,
      is_active: true,
      sort_order: 1,
    };
    await store.dispatch(policiesApi.endpoints.createLeavePolicy.initiate(body));

    const req = lastRequest();
    expect(req.method).toBe("POST");
    expect(req.url).toContain("/api/leave-policies/");
    expect(await req.clone().json()).toEqual(body);
  });

  it("updateLeavePolicy PATCHes the policy's detail URL", async () => {
    const store = makeStore();
    mockFetchOnce(samplePolicy({ id: 3, annual_entitlement: 30 }));

    await store.dispatch(
      policiesApi.endpoints.updateLeavePolicy.initiate({ id: 3, annual_entitlement: 30 })
    );

    const req = lastRequest();
    expect(req.method).toBe("PATCH");
    expect(req.url).toContain("/api/leave-policies/3/");
    expect(await req.clone().json()).toEqual({ annual_entitlement: 30 });
  });

  it("deleteLeavePolicy DELETEs the policy's detail URL and invalidates its tag", async () => {
    const store = makeStore();
    mockFetchOnce(null, { status: 204 });

    await store.dispatch(policiesApi.endpoints.deleteLeavePolicy.initiate({ id: 7 }));

    const req = lastRequest();
    expect(req.method).toBe("DELETE");
    expect(req.url).toContain("/api/leave-policies/7/");
  });
});
