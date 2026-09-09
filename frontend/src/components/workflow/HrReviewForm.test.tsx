import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import { HrReviewForm } from "./HrReviewForm";
import type { User } from "@/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockUser: User = {
  id: 2,
  username: "hr",
  full_name: "HR Person",
  email: "hr@example.com",
  role: "HR_ADMIN",
  is_active: true,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderForm(applicationId = 3) {
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <HrReviewForm applicationId={applicationId} />
    </Provider>
  );
  return store;
}

describe("HrReviewForm", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 3 }))) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the HR review section fields", () => {
    renderForm();
    expect(screen.getByText("Section B2 — HR Review")).toBeInTheDocument();
    expect(screen.getByLabelText("Verification")).toBeInTheDocument();
    expect(screen.getByLabelText("HR Comments")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Designation")).toBeInTheDocument();
  });

  it("requires signature name/designation before submitting", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Designation is required")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls verifyLeaveApplication with the correct payload", async () => {
    const user = userEvent.setup();
    renderForm(3);

    await user.selectOptions(screen.getByLabelText("Verification"), "Not verified");
    await user.type(screen.getByLabelText("HR Comments"), "Missing signature");
    await user.type(screen.getByLabelText("Name"), "HR Officer");
    await user.type(screen.getByLabelText("Designation"), "HR Admin");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = (global.fetch as jest.Mock).mock.calls[0][0] as Request;
    expect(request.url).toContain("/api/leave-applications/3/verify/");
    const body = JSON.parse(await request.text());
    expect(body).toEqual({
      decision: false,
      comments: "Missing signature",
      signature_name: "HR Officer",
      signature_designation: "HR Admin",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/hr/applications"));
  });
});
