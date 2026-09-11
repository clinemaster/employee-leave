import { makeStore } from "@/store";
import { personTypesApi } from "./personTypesApi";
import type { PersonType } from "@/types";

// Exercises personTypesApi's endpoints (query/mutation shape, tag
// invalidation) against a real RTK Query store, `fetch` mocked at the
// network boundary — matches the pattern in policiesApi.test.ts.

function mockFetchOnce(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
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

function samplePersonType(overrides: Partial<PersonType> = {}): PersonType {
  return { id: 1, name: "Mfanyakazi", is_active: true, sort_order: 1, ...overrides };
}

describe("personTypesApi", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getPersonTypes hits the list endpoint and provides the list tag", async () => {
    const store = makeStore();
    mockFetchOnce([samplePersonType({ id: 5 })]);

    const result = await store.dispatch(personTypesApi.endpoints.getPersonTypes.initiate());
    expect(result.data).toEqual([samplePersonType({ id: 5 })]);
    expect(lastRequest().url).toContain("/api/person-types/");

    const tags = personTypesApi.util.selectInvalidatedBy(store.getState(), ["PersonTypes"]);
    expect(tags.length).toBeGreaterThan(0);
  });

  it("getPersonTypes unwraps a paginated {results} response", async () => {
    const store = makeStore();
    mockFetchOnce({ count: 1, next: null, previous: null, results: [samplePersonType()] });

    const result = await store.dispatch(personTypesApi.endpoints.getPersonTypes.initiate());
    expect(result.data).toEqual([samplePersonType()]);
  });

  it("createPersonType POSTs to person-types/ with the given body", async () => {
    const store = makeStore();
    mockFetchOnce(samplePersonType({ id: 9 }));

    const body = { name: "Mtoto", is_active: true, sort_order: 3 };
    await store.dispatch(personTypesApi.endpoints.createPersonType.initiate(body));

    const req = lastRequest();
    expect(req.method).toBe("POST");
    expect(req.url).toContain("/api/person-types/");
    expect(await req.clone().json()).toEqual(body);
  });

  it("updatePersonType PATCHes the person type's detail URL", async () => {
    const store = makeStore();
    mockFetchOnce(samplePersonType({ id: 3, name: "Mke/Mume" }));

    await store.dispatch(personTypesApi.endpoints.updatePersonType.initiate({ id: 3, name: "Mke/Mume" }));

    const req = lastRequest();
    expect(req.method).toBe("PATCH");
    expect(req.url).toContain("/api/person-types/3/");
    expect(await req.clone().json()).toEqual({ name: "Mke/Mume" });
  });

  it("deactivatePersonType PATCHes is_active: false", async () => {
    const store = makeStore();
    mockFetchOnce(samplePersonType({ id: 4, is_active: false }));

    await store.dispatch(personTypesApi.endpoints.deactivatePersonType.initiate({ id: 4 }));

    const req = lastRequest();
    expect(req.method).toBe("PATCH");
    expect(req.url).toContain("/api/person-types/4/");
    expect(await req.clone().json()).toEqual({ is_active: false });
  });

  it("reorderPersonTypes POSTs the bulk sort_order array to person-types/reorder/", async () => {
    const store = makeStore();
    mockFetchOnce([samplePersonType({ id: 1, sort_order: 2 }), samplePersonType({ id: 2, sort_order: 1 })]);

    const body = [
      { id: 1, sort_order: 2 },
      { id: 2, sort_order: 1 },
    ];
    await store.dispatch(personTypesApi.endpoints.reorderPersonTypes.initiate(body));

    const req = lastRequest();
    expect(req.method).toBe("POST");
    expect(req.url).toContain("/api/person-types/reorder/");
    expect(await req.clone().json()).toEqual(body);
  });
});
