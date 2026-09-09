import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import { HodRecommendationForm } from "./HodRecommendationForm";
import type { User } from "@/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockUser: User = {
  id: 1,
  username: "hod",
  full_name: "Hod Person",
  email: "hod@example.com",
  role: "HEAD_OF_DEPARTMENT",
  is_active: true,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderForm(applicationId = 5) {
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <HodRecommendationForm applicationId={applicationId} />
    </Provider>
  );
  return store;
}

describe("HodRecommendationForm", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 5 }))) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the recommendation section fields", () => {
    renderForm();
    expect(screen.getByText("Section B1 — Recommendation")).toBeInTheDocument();
    expect(screen.getByLabelText(/Recommendation/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Designation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Recommendation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return" })).toBeInTheDocument();
  });

  it("requires comments when 'Do not recommend' is selected, and blocks submission", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/Recommendation/), "Do not recommend");
    await user.type(screen.getByLabelText("Name"), "Jane Manager");
    await user.type(screen.getByLabelText("Designation"), "HOD");
    await user.click(screen.getByRole("button", { name: "Submit Recommendation" }));

    expect(await screen.findByText("Comments are required when not recommending")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls recommendLeaveApplication with the correct payload when recommending", async () => {
    const user = userEvent.setup();
    renderForm(5);

    // Explicitly select "Recommend" — react-hook-form's `watch()` for an
    // untouched native <select> can lag the actual default until the user
    // interacts with it, so don't rely on the implicit default here.
    await user.selectOptions(screen.getByLabelText(/Recommendation/), "Recommend");
    await user.type(screen.getByLabelText("Name"), "Jane Manager");
    await user.type(screen.getByLabelText("Designation"), "HOD");
    await user.click(screen.getByRole("button", { name: "Submit Recommendation" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = (global.fetch as jest.Mock).mock.calls[0][0] as Request;
    expect(request.url).toContain("/api/leave-applications/5/recommend/");
    const body = JSON.parse(await request.text());
    expect(body).toEqual({
      decision: true,
      comments: "",
      signature_name: "Jane Manager",
      signature_designation: "HOD",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/hod/applications"));
  });

  it("requires comments on the Return form and blocks submission when empty", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Return" }));

    expect(await screen.findByText("Comments are required to return the application")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls returnLeaveApplication with comments when returning", async () => {
    const user = userEvent.setup();
    renderForm(9);

    await user.type(screen.getByLabelText("Return to Applicant (with comments)"), "Please fix dates");
    await user.click(screen.getByRole("button", { name: "Return" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = (global.fetch as jest.Mock).mock.calls[0][0] as Request;
    expect(request.url).toContain("/api/leave-applications/9/return/");
    const body = JSON.parse(await request.text());
    expect(body).toEqual({ comments: "Please fix dates" });
  });
});
