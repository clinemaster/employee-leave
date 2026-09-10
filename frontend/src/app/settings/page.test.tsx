import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import SettingsPage from "./page";
import type { User } from "@/types";

// Renders the settings page inside AppShell/RoleGuard as an authenticated
// user and exercises the MFA enable/disable toggle, mocking fetch for
// /api/users/me/, /api/auth/mfa/setup/, /verify-setup/, /disable/, and the
// AppShell's notifications call, following the pattern in
// admin/leave-policies/page.test.tsx.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/settings",
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: "emp1",
    full_name: "Employee One",
    email: "emp1@example.com",
    role: "EMPLOYEE",
    is_active: true,
    mfa_enabled: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setupFetch(user: User) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = jest.fn().mockImplementation(async (input: Request | string) => {
    const req = typeof input === "string" ? new Request(input) : input;
    const url = req.url;
    const method = req.method;
    let body: unknown;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await req.clone().json();
      } catch {
        body = undefined;
      }
    }
    calls.push({ url, method, body });

    if (url.includes("notifications/")) return jsonResponse([]);
    if (url.includes("users/me/")) return jsonResponse(user);
    if (url.includes("auth/mfa/setup/")) {
      return jsonResponse({ secret: "JBSWY3DPEHPK3PXP", provisioning_uri: "otpauth://totp/NAOT:emp1?secret=JBSWY3DPEHPK3PXP&issuer=NAOT" });
    }
    if (url.includes("auth/mfa/verify-setup/")) {
      if (body && (body as { code: string }).code === "654321") {
        return jsonResponse(makeUser({ mfa_enabled: true }));
      }
      return jsonResponse({ detail: "Invalid or expired code." }, 400);
    }
    if (url.includes("auth/mfa/disable/")) {
      if (body && (body as { password: string }).password === "TestPass123!") {
        return jsonResponse(makeUser({ mfa_enabled: false }));
      }
      return jsonResponse({ detail: "Incorrect password." }, 400);
    }
    return jsonResponse([]);
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage(user: User) {
  const calls = setupFetch(user);
  const store = makeStore({ user, accessToken: "token", refreshToken: null, isAuthenticated: true });
  render(
    <Provider store={store}>
      <SettingsPage />
    </Provider>
  );
  return { calls };
}

describe("SettingsPage — MFA", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the enable button when MFA is not enabled", async () => {
    renderPage(makeUser({ mfa_enabled: false }));
    expect(await screen.findByText(/not enabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable MFA" })).toBeInTheDocument();
  });

  it("starts setup, shows the secret/QR URI, and enables MFA on correct code", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage(makeUser({ mfa_enabled: false }));

    await user.click(await screen.findByRole("button", { name: "Enable MFA" }));

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Confirmation Code"), "654321");
    await user.click(screen.getByRole("button", { name: "Confirm & Enable" }));

    await waitFor(() => {
      expect(screen.getByText(/now enabled/i)).toBeInTheDocument();
    });

    const verifyCall = calls.find((c) => c.url.includes("verify-setup/"));
    expect(verifyCall?.body).toMatchObject({ code: "654321" });
  });

  it("shows an error and does not enable MFA on an incorrect code", async () => {
    const user = userEvent.setup();
    renderPage(makeUser({ mfa_enabled: false }));

    await user.click(await screen.findByRole("button", { name: "Enable MFA" }));
    await screen.findByText("JBSWY3DPEHPK3PXP");

    await user.type(screen.getByLabelText("Confirmation Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Confirm & Enable" }));

    expect(await screen.findByText(/invalid code/i)).toBeInTheDocument();
  });

  it("shows the disable flow when MFA is already enabled, requiring password", async () => {
    const user = userEvent.setup();
    const { calls } = renderPage(makeUser({ mfa_enabled: true }));

    expect(await screen.findByText(/is enabled/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disable MFA" }));

    await user.type(screen.getByLabelText(/Confirm your password/i), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Confirm Disable" }));

    await waitFor(() => {
      expect(screen.getByText(/has been disabled/i)).toBeInTheDocument();
    });

    const disableCall = calls.find((c) => c.url.includes("mfa/disable/"));
    expect(disableCall?.body).toMatchObject({ password: "TestPass123!" });
  });

  it("shows an error when disabling with the wrong password", async () => {
    const user = userEvent.setup();
    renderPage(makeUser({ mfa_enabled: true }));

    await user.click(await screen.findByRole("button", { name: "Disable MFA" }));
    await user.type(screen.getByLabelText(/Confirm your password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Confirm Disable" }));

    expect(await screen.findByText(/incorrect password/i)).toBeInTheDocument();
  });
});
