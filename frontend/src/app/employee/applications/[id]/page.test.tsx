import { Suspense } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import EmployeeApplicationDetailPage from "./page";
import type { LeaveApplication, User } from "@/types";

// Smoke test: the employee detail page is entirely read-only (Section
// A/B1/B2/C via SectionReadOnly components) — no editable workflow form is
// rendered for this role, matching FRONTEND.md's RBAC matrix (only the
// applicant's own PDF download action is available, gated on status).

const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => "/employee/applications/1",
}));

const mockUser: User = {
  id: 1,
  username: "jdoe",
  full_name: "Jane Doe",
  email: "jdoe@example.com",
  role: "EMPLOYEE",
  is_active: true,
};

function sampleApplication(overrides: Partial<LeaveApplication> = {}): LeaveApplication {
  return {
    id: 1,
    employee: 1,
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
    status: "PENDING_HOD_REVIEW",
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

function mockFetch(application: LeaveApplication) {
  global.fetch = jest.fn().mockImplementation((input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("leave-applications/1/")) return Promise.resolve(jsonResponse(application));
    if (url.includes("notifications/")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse([]));
  }) as unknown as typeof fetch;
}

function renderPage(application: LeaveApplication) {
  mockFetch(application);
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <Suspense fallback={null}>
        <EmployeeApplicationDetailPage params={resolvedParams("1")} />
      </Suspense>
    </Provider>
  );
}

describe("EmployeeApplicationDetailPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders all sections read-only, with no editable workflow form", async () => {
    renderPage(sampleApplication());

    expect(await screen.findByText("Section A — Applicant Details")).toBeInTheDocument();
    expect(screen.getByText("Section B1 — Line Manager Recommendation")).toBeInTheDocument();
    expect(screen.getByText("Section B2 — HR Review")).toBeInTheDocument();
    expect(screen.getByText("Section C — Authorization")).toBeInTheDocument();

    // No workflow mutation form (recommend/verify/approve/deny) is rendered
    // for the applicant's own view.
    expect(screen.queryByRole("button", { name: /Submit Recommendation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Deny/ })).not.toBeInTheDocument();
  });

  it("disables PDF download until the application is APPROVED/PDF_GENERATED", async () => {
    renderPage(sampleApplication({ status: "PENDING_HOD_REVIEW" }));
    await screen.findByText("Section A — Applicant Details");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  it("enables PDF download once APPROVED", async () => {
    renderPage(sampleApplication({ status: "APPROVED" }));
    await screen.findByText("Section A — Applicant Details");
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).not.toBeDisabled());
  });
});
