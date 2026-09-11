import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import HodApplicationDetailPage from "./page";
import type { LeaveApplication, User } from "@/types";

// Smoke test: the HOD detail page shows Section A read-only plus the
// editable HodRecommendationForm (Section B1), matching FRONTEND.md's RBAC
// matrix — line managers can act on B1 only, not verify/approve.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/hod/applications/1",
}));

const mockUser: User = {
  id: 2,
  username: "hod",
  full_name: "Hod Person",
  email: "hod@example.com",
  role: "HEAD_OF_DEPARTMENT",
  is_active: true,
};

function sampleApplication(): LeaveApplication {
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
    status: "PENDING_HOD_REVIEW",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
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

function renderPage() {
  global.fetch = jest.fn().mockImplementation((input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("leave-applications/1/")) return Promise.resolve(jsonResponse(sampleApplication()));
    if (url.includes("notifications/")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse([]));
  }) as unknown as typeof fetch;

  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <Suspense fallback={null}>
        <HodApplicationDetailPage params={resolvedParams("1")} />
      </Suspense>
    </Provider>
  );
}

describe("HodApplicationDetailPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows Section A read-only and an editable recommendation form (B1 only)", async () => {
    renderPage();

    expect(await screen.findByText("Section A — Applicant Details")).toBeInTheDocument();
    expect(screen.getByText("Section B1 — Recommendation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Recommendation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return" })).toBeInTheDocument();

    // HOD cannot verify (B2) or approve/deny (C) — those forms must not render here.
    expect(screen.queryByText("Section B2 — HR Review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
  });
});
