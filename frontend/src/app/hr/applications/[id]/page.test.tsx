import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import HrApplicationDetailPage from "./page";
import type { LeaveApplication, User } from "@/types";

// Smoke test: the HR detail page shows Section A + B1 read-only, leave
// balances, and the editable HrReviewForm (Section B2) — no approve/deny.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/hr/applications/1",
}));

const mockUser: User = {
  id: 3,
  username: "hr",
  full_name: "HR Person",
  email: "hr@example.com",
  role: "HR_ADMIN",
  is_active: true,
};

function sampleApplication(overrides: Partial<LeaveApplication> = {}): LeaveApplication {
  return {
    id: 1,
    employee: 5,
    full_name: "Jane Doe",
    designation: "Officer",
    station: "HQ",
    division_department: "IT",
    leave_type: 1,
    leave_type_name: "Annual Leave",
    travel_assistance: false,
    start_date: "2026-01-01",
    last_date: "2026-01-05",
    dependants: [],
    travel_routes: [],
    taxi_expenses: [],
    mizigo_items: [],
    status: "PENDING_HR_REVIEW",
    recommendation: { recommended: true, comments: "OK", signature_name: "Boss", signature_designation: "HOD" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

// React's `use()` suspends on a *pending* thenable, even one that resolves on
// the next microtask — Next.js's real `params` promise avoids this by
// pre-attaching `status`/`value` (the informal contract `use()` recognizes
// for an already-settled thenable) so the client component doesn't have to
// wait a tick to unwrap it. Mirror that here rather than a bare
// `Promise.resolve(...)`, or the page suspends indefinitely under jsdom.
function resolvedParams(id: string) {
  const promise = Promise.resolve({ id }) as Promise<{ id: string }> & { status?: string; value?: { id: string } };
  promise.status = "fulfilled";
  promise.value = { id };
  return promise;
}

function renderPage(application: LeaveApplication = sampleApplication()) {
  global.fetch = jest.fn().mockImplementation((input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("leave-applications/1/")) return Promise.resolve(jsonResponse(application));
    if (url.includes("notifications/")) return Promise.resolve(jsonResponse([]));
    if (url.includes("leave-balances/")) return Promise.resolve(jsonResponse([]));
    if (url.includes("leave-types/")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse([]));
  }) as unknown as typeof fetch;

  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <Suspense fallback={null}>
        <HrApplicationDetailPage params={resolvedParams("1")} />
      </Suspense>
    </Provider>
  );
}

describe("HrApplicationDetailPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows Section A + B1 read-only and an editable HR review form (B2 only)", async () => {
    renderPage();

    expect(await screen.findByText("Section A — Applicant Details")).toBeInTheDocument();
    expect(screen.getByText("Section B1 — Line Manager Recommendation")).toBeInTheDocument();
    expect(screen.getByText("Section B2 — HR Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Verification")).toBeInTheDocument();

    // HR cannot recommend (that's already-decided/read-only B1) or approve/deny (C).
    expect(screen.queryByRole("button", { name: "Submit Recommendation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
  });

  it("does not show a Travel Payment Request section when the application has no travel data", async () => {
    renderPage(sampleApplication());
    await screen.findByText("Section A — Applicant Details");
    expect(screen.queryByText("Travel Payment Request — JEDWALI 1")).not.toBeInTheDocument();
  });

  it("shows the Travel Payment Request breakdown (JEDWALI 1) so HR can see the requested amount before verifying", async () => {
    renderPage(
      sampleApplication({
        travel_assistance: true,
        travel_routes: [
          {
            id: 1,
            from_place: "Dodoma",
            to_place: "Musoma Mjini",
            fare_per_person: 85000,
            trip_type: "ROUND_TRIP",
            sort_order: 0,
            passengers: [{ id: 1, person_type: 1, person_type_name: "Mimi", idadi: 1, total: 170000 }],
          },
        ],
        taxi_expenses: [{ id: 1, description: "", number_of_trips: 2, cost_per_trip: 100000, sort_order: 0, total: 200000 }],
        mizigo_items: [],
      })
    );

    expect(await screen.findByText("Travel Payment Request — JEDWALI 1")).toBeInTheDocument();
    expect(screen.getByText("JUMLA KUU")).toBeInTheDocument();
    expect(screen.getByText("370,000")).toBeInTheDocument(); // 170,000 NAULI + 200,000 TAXI
  });
});
