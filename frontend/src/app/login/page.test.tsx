import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import LoginPage from "./page";
import type { User } from "@/types";

// Exercises the login flow, including the MFA-challenge second step: after
// submitting username/password, if the API returns
// {mfa_required: true, mfa_token}, a code input appears; submitting that
// calls /api/auth/mfa/login-verify/ to complete login.

const pushMock = jest.fn();
const searchParamsGet = jest.fn().mockReturnValue(null);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

const mfaUser: User = {
  id: 1,
  username: "sysadmin1",
  full_name: "System Admin",
  email: "sysadmin1@example.com",
  role: "SYSTEM_ADMIN",
  is_active: true,
  mfa_enabled: true,
};

const plainUser: User = {
  id: 2,
  username: "emp1",
  full_name: "Employee One",
  email: "emp1@example.com",
  role: "EMPLOYEE",
  is_active: true,
  mfa_enabled: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setupFetch({ mfa }: { mfa: boolean }) {
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

    if (url.includes("auth/login/")) {
      const creds = body as { username: string; password: string };
      if (creds.password !== "TestPass123!") {
        return jsonResponse({ detail: "No active account found with the given credentials" }, 401);
      }
      if (mfa) {
        return jsonResponse({ mfa_required: true, mfa_token: "signed-challenge-token" });
      }
      return jsonResponse({ access: "access-token", refresh: "refresh-token", user: plainUser });
    }
    if (url.includes("auth/mfa/login-verify/")) {
      const payload = body as { mfa_token: string; code: string };
      if (payload.code === "654321") {
        return jsonResponse({ access: "access-token", refresh: "refresh-token", user: mfaUser });
      }
      return jsonResponse({ detail: "Invalid or expired code." }, 400);
    }
    return jsonResponse([]);
  }) as unknown as typeof fetch;
  return calls;
}

function renderPage() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <LoginPage />
    </Provider>
  );
}

describe("LoginPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    pushMock.mockClear();
    window.localStorage.clear();
  });

  it("logs in directly when the account has no MFA enabled", async () => {
    setupFetch({ mfa: false });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Username"), "emp1");
    await user.type(screen.getByLabelText("Password"), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText("Authentication Code")).not.toBeInTheDocument();
  });

  it("shows the MFA code step when the API returns an MFA challenge", async () => {
    setupFetch({ mfa: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Username"), "sysadmin1");
    await user.type(screen.getByLabelText("Password"), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("Authentication Code")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("completes login after submitting a correct MFA code", async () => {
    const calls = setupFetch({ mfa: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Username"), "sysadmin1");
    await user.type(screen.getByLabelText("Password"), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByLabelText("Authentication Code");
    await user.type(screen.getByLabelText("Authentication Code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });

    const verifyCall = calls.find((c) => c.url.includes("mfa/login-verify/"));
    expect(verifyCall?.body).toMatchObject({ mfa_token: "signed-challenge-token", code: "654321" });
    expect(window.localStorage.getItem("naot_access_token")).toBe("access-token");
  });

  it("shows an error and stays on the MFA step for an incorrect code", async () => {
    setupFetch({ mfa: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Username"), "sysadmin1");
    await user.type(screen.getByLabelText("Password"), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByLabelText("Authentication Code");
    await user.type(screen.getByLabelText("Authentication Code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(/invalid or expired code/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("allows going back to the username/password step from the MFA step", async () => {
    setupFetch({ mfa: true });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Username"), "sysadmin1");
    await user.type(screen.getByLabelText("Password"), "TestPass123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByLabelText("Authentication Code");
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });
});
