import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import AdminLeaveTypesPage from "./page";
import type { LeaveType, User } from "@/types";

// Regression coverage: the "Edit" button used to be a no-op that PATCHed a
// leave type's own unchanged name back to itself, with no input field for
// the admin to actually change anything ("sysadmin cannot edit leave
// type"). Now it opens an inline edit row with real Code/Name inputs.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/admin/leave-types",
}));

const mockAdmin: User = {
  id: 1,
  username: "admin",
  full_name: "Sys Admin",
  email: "admin@example.com",
  role: "SYSTEM_ADMIN",
  is_active: true,
};

function sampleLeaveType(overrides: Partial<LeaveType> = {}): LeaveType {
  return { id: 1, name: "Annual Leave", code: "AL", is_active: true, sort_order: 1, ...overrides };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setupFetch(leaveTypes: LeaveType[]) {
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

    if (url.includes("notifications/")) return jsonResponse([]);
    if (url.match(/leave-types\/\d+\/$/) && method === "PATCH") {
      return jsonResponse({ ...leaveTypes[0], ...(body as object) });
    }
    if (url.includes("leave-types/")) return jsonResponse(leaveTypes);
    return jsonResponse([]);
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage(leaveTypes: LeaveType[] = [sampleLeaveType()]) {
  const calls = setupFetch(leaveTypes);
  const store = makeStore({ user: mockAdmin, accessToken: "token", refreshToken: null, isAuthenticated: true, hydrated: true });
  render(
    <Provider store={store}>
      <AdminLeaveTypesPage />
    </Provider>
  );
  return { calls };
}

describe("AdminLeaveTypesPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the leave type list", async () => {
    renderPage();
    expect(await screen.findByText("Annual Leave")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("clicking Edit opens editable Code/Name inputs pre-filled with the current values, not a no-op", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Annual Leave");

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const nameInput = screen.getByLabelText("Edit name") as HTMLInputElement;
    const codeInput = screen.getByLabelText("Edit code") as HTMLInputElement;
    expect(nameInput.value).toBe("Annual Leave");
    expect(codeInput.value).toBe("AL");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("editing the name and saving PATCHes the actual new value, not the unchanged original", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage();
    await screen.findByText("Annual Leave");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Edit name");
    await user.clear(nameInput);
    await user.type(nameInput, "Annual Leave (Updated)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === "PATCH" && c.url.includes("leave-types/1/"));
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({ name: "Annual Leave (Updated)", code: "AL" });
    });
  });

  it("Cancel discards edits without saving", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage();
    await screen.findByText("Annual Leave");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Edit name"), " extra");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Annual Leave")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("shows a visible error instead of crashing when the save is rejected", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation(async (input: Request | string) => {
      const req = typeof input === "string" ? new Request(input) : input;
      if (req.url.includes("notifications/")) return jsonResponse([]);
      if (req.method === "PATCH") {
        return new Response(JSON.stringify({ detail: "Not authorized." }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return jsonResponse([sampleLeaveType()]);
    }) as unknown as typeof fetch;
    const store = makeStore({ user: mockAdmin, accessToken: "token", refreshToken: null, isAuthenticated: true, hydrated: true });
    render(
      <Provider store={store}>
        <AdminLeaveTypesPage />
      </Provider>
    );
    await screen.findByText("Annual Leave");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Not authorized.")).toBeInTheDocument();
  });
});
