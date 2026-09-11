import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import AdminPersonTypesPage from "./page";
import type { PersonType, User } from "@/types";

// Renders the person-types admin page inside AppShell/RoleGuard as an
// authenticated SYSTEM_ADMIN, mocks fetch, and asserts: list/create/edit/
// activate/reorder — mirrors app/admin/leave-types/page.test.tsx's harness.
//
// Regression coverage: the create form used to only collect `name`, but
// `code` is required and unique on the backend (like LeaveType), so every
// create attempt 400'd. Separately, "Edit" used to PATCH the row's own
// unchanged name/code back to itself with no input field, and inactive
// rows had no way back to active from the UI.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/admin/person-types",
}));

const mockAdmin: User = {
  id: 1,
  username: "admin",
  full_name: "Sys Admin",
  email: "admin@example.com",
  role: "SYSTEM_ADMIN",
  is_active: true,
};

function samplePersonType(overrides: Partial<PersonType> = {}): PersonType {
  return { id: 1, name: "Mimi", code: "SELF", is_active: true, sort_order: 1, ...overrides };
}

function jsonResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setupFetch(personTypes: PersonType[]) {
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

    if (url.includes("person-types/reorder/")) return jsonResponse(personTypes);
    if (url.includes("person-types/") && method === "POST") return jsonResponse(samplePersonType({ id: 99 }));
    if (url.match(/person-types\/\d+\/$/) && method === "PATCH") {
      return jsonResponse({ ...personTypes[0], ...(body as object) });
    }
    if (url.includes("person-types/")) return jsonResponse(personTypes);
    if (url.includes("notifications/")) return jsonResponse([]);
    return jsonResponse([]);
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage(personTypes: PersonType[] = [samplePersonType()]) {
  const calls = setupFetch(personTypes);
  const store = makeStore({ user: mockAdmin, accessToken: "token", refreshToken: null, isAuthenticated: true, hydrated: true });
  render(
    <Provider store={store}>
      <AdminPersonTypesPage />
    </Provider>
  );
  return { calls };
}

describe("AdminPersonTypesPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders existing person types sorted by sort_order", async () => {
    renderPage([
      samplePersonType({ id: 1, name: "Mke", code: "SPOUSE", sort_order: 2 }),
      samplePersonType({ id: 2, name: "Mimi", code: "SELF", sort_order: 1 }),
    ]);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // skip header
    expect(within(rows[0]).getByText("Mimi")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Mke")).toBeInTheDocument();
  });

  it("shows an empty-state message when no person types exist", async () => {
    renderPage([]);
    expect(await screen.findByText(/No person types configured/i)).toBeInTheDocument();
  });

  it("requires both name and code before submitting the create form (code is required/unique on the backend)", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([]);
    await screen.findByText(/No person types configured/i);

    await user.type(screen.getByLabelText("Name"), "Mtoto");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // No code entered -> handleCreate's guard should block the request.
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await user.type(screen.getByLabelText("Code"), "CHILD");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const postCall = calls.find((c) => c.method === "POST" && c.url.includes("person-types/"));
      expect(postCall).toBeTruthy();
      expect(postCall?.body).toMatchObject({ name: "Mtoto", code: "CHILD", is_active: true });
    });
  });

  it("reorders via the up/down buttons using the bulk reorder endpoint", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([
      samplePersonType({ id: 1, name: "First", code: "F", sort_order: 1 }),
      samplePersonType({ id: 2, name: "Second", code: "S", sort_order: 2 }),
    ]);

    const table = await screen.findByRole("table");
    const firstRow = within(table).getByText("First").closest("tr")!;
    await user.click(within(firstRow).getByRole("button", { name: "Move down" }));

    await waitFor(() => {
      const reorderCall = calls.find((c) => c.url.includes("person-types/reorder/"));
      expect(reorderCall).toBeTruthy();
      expect(reorderCall?.body).toEqual([
        { id: 1, sort_order: 2 },
        { id: 2, sort_order: 1 },
      ]);
    });
  });

  it("clicking Edit opens editable Code/Name inputs pre-filled with the current values, and Save sends the actual new value", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage();
    await screen.findByText("Mimi");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Edit name") as HTMLInputElement;
    const codeInput = screen.getByLabelText("Edit code") as HTMLInputElement;
    expect(nameInput.value).toBe("Mimi");
    expect(codeInput.value).toBe("SELF");

    await user.clear(nameInput);
    await user.type(nameInput, "Mimi Mwenyewe");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === "PATCH" && c.url.includes("person-types/1/"));
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({ name: "Mimi Mwenyewe", code: "SELF" });
    });
  });

  it("Cancel discards edits without saving", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage();
    await screen.findByText("Mimi");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Edit name"), " extra");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Mimi")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("shows an Activate button (not Deactivate) for an inactive person type, and PATCHes is_active: true", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([samplePersonType({ id: 2, name: "Old Category", code: "OLD", is_active: false })]);
    await screen.findByText("Old Category");

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      const patchCall = calls.find((c) => c.method === "PATCH" && c.url.includes("person-types/2/"));
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({ is_active: true });
    });
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
      return jsonResponse([samplePersonType()]);
    }) as unknown as typeof fetch;
    const store = makeStore({ user: mockAdmin, accessToken: "token", refreshToken: null, isAuthenticated: true, hydrated: true });
    render(
      <Provider store={store}>
        <AdminPersonTypesPage />
      </Provider>
    );
    await screen.findByText("Mimi");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Not authorized.")).toBeInTheDocument();
  });
});
