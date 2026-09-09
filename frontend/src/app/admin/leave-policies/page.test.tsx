import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import AdminLeavePoliciesPage from "./page";
import type { LeavePolicy, LeaveType, User } from "@/types";

// Renders the leave-policies admin page inside AppShell/RoleGuard as an
// authenticated SYSTEM_ADMIN, mocks fetch for leave-types + leave-policies,
// and asserts: the list renders grouped/sorted, the create form posts the
// right body, and delete calls the right DELETE url.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/admin/leave-policies",
}));

const mockAdmin: User = {
  id: 1,
  username: "admin",
  full_name: "Sys Admin",
  email: "admin@example.com",
  role: "SYSTEM_ADMIN",
  is_active: true,
};

const leaveTypes: LeaveType[] = [
  { id: 1, name: "Annual Leave", code: "AL", is_active: true, sort_order: 1 },
  { id: 2, name: "Sick Leave", code: "SL", is_active: true, sort_order: 2 },
];

function samplePolicy(overrides: Partial<LeavePolicy> = {}): LeavePolicy {
  return {
    id: 10,
    leave_type: 1,
    leave_type_name: "Annual Leave",
    min_years_of_service: 0,
    max_years_of_service: 5,
    annual_entitlement: 21,
    is_active: true,
    sort_order: 1,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setupFetch(policies: LeavePolicy[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = jest.fn().mockImplementation(async (input: Request | string) => {
    const req = typeof input === "string" ? new Request(input) : input;
    const url = req.url;
    const method = req.method;
    let body: unknown = undefined;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await req.clone().json();
      } catch {
        body = undefined;
      }
    }
    calls.push({ url, method, body });

    if (url.includes("leave-types/")) return jsonResponse(leaveTypes);
    if (url.includes("leave-policies/") && method === "POST") return jsonResponse(samplePolicy({ id: 99 }));
    if (url.includes("leave-policies/") && method === "DELETE") return jsonResponse(null, 204);
    if (url.includes("notifications/")) return jsonResponse([]);
    if (url.includes("leave-policies/")) return jsonResponse(policies);
    return jsonResponse([]);
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage(policies: LeavePolicy[] = [samplePolicy()]) {
  const calls = setupFetch(policies);
  const store = makeStore({ user: mockAdmin, accessToken: "token", refreshToken: null, isAuthenticated: true });
  render(
    <Provider store={store}>
      <AdminLeavePoliciesPage />
    </Provider>
  );
  return { calls };
}

describe("AdminLeavePoliciesPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders existing policies with leave type name, tenure band, and entitlement", async () => {
    renderPage([samplePolicy()]);

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Annual Leave")).toBeInTheDocument();
    expect(within(table).getByText("21")).toBeInTheDocument();
    expect(within(table).getByText((_, el) => el?.textContent === "0–5")).toBeInTheDocument();
  });

  it("shows an empty-state message when no policies exist", async () => {
    renderPage([]);
    expect(await screen.findByText(/No policies configured/i)).toBeInTheDocument();
  });

  it("submits the create form with the expected body", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([]);

    await screen.findByText(/No policies configured/i);

    const leaveTypeSelect = screen.getByLabelText("Leave Type");
    await user.selectOptions(leaveTypeSelect, "2");
    await user.type(screen.getByLabelText("Annual Entitlement (days)"), "14");

    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const postCall = calls.find((c) => c.method === "POST" && c.url.includes("leave-policies/"));
      expect(postCall).toBeTruthy();
      expect(postCall?.body).toMatchObject({
        leave_type: 2,
        annual_entitlement: 14,
        min_years_of_service: null,
        max_years_of_service: null,
        is_active: true,
      });
    });
  });

  it("shows a validation error when required fields are missing", async () => {
    const user = userEvent.setup();
    renderPage([]);
    await screen.findByText(/No policies configured/i);

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/Leave type and annual entitlement are required/i)).toBeInTheDocument();
  });

  it("deletes a policy via the Delete button", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([samplePolicy({ id: 42 })]);

    const table = await screen.findByRole("table");
    const row = within(table).getByText("Annual Leave").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      const deleteCall = calls.find((c) => c.method === "DELETE");
      expect(deleteCall?.url).toContain("/api/leave-policies/42/");
    });
  });
});
