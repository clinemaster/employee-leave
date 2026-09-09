import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import { ApprovalForm } from "./ApprovalForm";
import type { User } from "@/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockUser: User = {
  id: 3,
  username: "ao",
  full_name: "AO Person",
  email: "ao@example.com",
  role: "AUTHORIZING_OFFICER",
  is_active: true,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderForm(applicationId = 8) {
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <ApprovalForm applicationId={applicationId} />
    </Provider>
  );
  return store;
}

describe("ApprovalForm", () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse({ id: 8 }))) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders both the approve and deny sections", () => {
    renderForm();
    expect(screen.getByText("Section C — Authorization")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
    expect(screen.getByLabelText("Comments (approval)")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for Denial (required to deny)")).toBeInTheDocument();
  });

  it("requires a reason to deny, and blocks submission when empty", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Deny" }));

    expect(await screen.findByText("A reason is required to deny")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls approveLeaveApplication with the correct payload on approve", async () => {
    const user = userEvent.setup();
    renderForm(8);

    const nameInputs = screen.getAllByLabelText("Name");
    const designationInputs = screen.getAllByLabelText("Designation");
    await user.type(nameInputs[0], "Officer One");
    await user.type(designationInputs[0], "AO");
    await user.type(screen.getByLabelText("Comments (approval)"), "Looks good");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = (global.fetch as jest.Mock).mock.calls[0][0] as Request;
    expect(request.url).toContain("/api/leave-applications/8/approve/");
    const body = JSON.parse(await request.text());
    expect(body).toEqual({
      comments: "Looks good",
      signature_name: "Officer One",
      signature_designation: "AO",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/authorization/applications"));
  });

  it("calls denyLeaveApplication with the correct payload when a reason is provided", async () => {
    const user = userEvent.setup();
    renderForm(8);

    await user.type(screen.getByLabelText("Reason for Denial (required to deny)"), "Insufficient balance");
    const nameInputs = screen.getAllByLabelText("Name");
    const designationInputs = screen.getAllByLabelText("Designation");
    await user.type(nameInputs[1], "Officer Two");
    await user.type(designationInputs[1], "AO");
    await user.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const request = (global.fetch as jest.Mock).mock.calls[0][0] as Request;
    expect(request.url).toContain("/api/leave-applications/8/deny/");
    const body = JSON.parse(await request.text());
    expect(body).toEqual({
      comments: "Insufficient balance",
      signature_name: "Officer Two",
      signature_designation: "AO",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/authorization/applications"));
  });
});
