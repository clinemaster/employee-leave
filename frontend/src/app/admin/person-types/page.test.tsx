import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import AdminPersonTypesPage from "./page";
import type { PersonType, User } from "@/types";

// Renders the person-types admin page inside AppShell/RoleGuard as an
// authenticated SYSTEM_ADMIN, mocks fetch, and asserts: list/create/reorder
// — mirrors app/admin/leave-policies/page.test.tsx's harness.

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
  return { id: 1, name: "Mfanyakazi", is_active: true, sort_order: 1, ...overrides };
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
    if (url.includes("person-types/") && method === "PATCH") return jsonResponse(samplePersonType());
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
      samplePersonType({ id: 1, name: "Mke/Mume", sort_order: 2 }),
      samplePersonType({ id: 2, name: "Mfanyakazi", sort_order: 1 }),
    ]);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // skip header
    expect(within(rows[0]).getByText("Mfanyakazi")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Mke/Mume")).toBeInTheDocument();
  });

  it("shows an empty-state message when no person types exist", async () => {
    renderPage([]);
    expect(await screen.findByText(/No person types configured/i)).toBeInTheDocument();
  });

  it("submits the create form with the expected body", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([]);

    await screen.findByText(/No person types configured/i);

    await user.type(screen.getByLabelText("Name"), "Mtoto");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const postCall = calls.find((c) => c.method === "POST" && c.url.includes("person-types/"));
      expect(postCall).toBeTruthy();
      expect(postCall?.body).toMatchObject({ name: "Mtoto", is_active: true });
    });
  });

  it("reorders via the up/down buttons using the bulk reorder endpoint", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage([
      samplePersonType({ id: 1, name: "First", sort_order: 1 }),
      samplePersonType({ id: 2, name: "Second", sort_order: 2 }),
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
});
