import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import { LeaveApplicationForm } from "./LeaveApplicationForm";
import type { User } from "@/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockUser: User = {
  id: 1,
  username: "jdoe",
  full_name: "Jane Doe",
  email: "jdoe@example.com",
  role: "EMPLOYEE",
  check_number: "CN1",
  personnel_file_number: "PF1",
  department: 1,
  department_name: "IT",
  work_station: 1,
  work_station_name: "HQ",
  designation: 1,
  designation_name: "Officer",
  is_active: true,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderForm(user: User = mockUser) {
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user }));
  render(
    <Provider store={store}>
      <LeaveApplicationForm />
    </Provider>
  );
  return store;
}

describe("LeaveApplicationForm", () => {
  beforeEach(() => {
    push.mockClear();
    // RTK Query's fetchBaseQuery calls `fetch(request)` with a single Request
    // instance, not a plain url string — read `.url` off it (or off a plain
    // string, in case that ever changes) before matching.
    global.fetch = jest.fn().mockImplementation((input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("leave-types")) {
        return Promise.resolve(
          jsonResponse([{ id: 1, name: "Annual Leave", code: "ANNUAL", is_active: true, sort_order: 1 }])
        );
      }
      if (url.includes("working-days-preview")) {
        return Promise.resolve(jsonResponse({ working_days: 3 }));
      }
      if (url.includes("person-types")) {
        return Promise.resolve(
          jsonResponse([
            { id: 1, name: "Mfanyakazi", is_active: true, sort_order: 1 },
            { id: 2, name: "Mke/Mume", is_active: true, sort_order: 2 },
          ])
        );
      }
      return Promise.resolve(jsonResponse({ id: 1 }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts on Leave Request (personal info moved to its own sidebar page)", async () => {
    renderForm();
    expect(await screen.findByRole("heading", { name: "Leave Request" })).toBeInTheDocument();
    // Back is disabled on the first step since there's no earlier step anymore.
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("blocks advancing past Leave Request when leave type / dates are missing", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("heading", { name: "Leave Request" });

    await user.click(screen.getByRole("button", { name: "Next" }));

    // Client-side validation (react-hook-form + zod) should block navigation:
    // the Dependants step must never appear, and Leave Request stays visible.
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Dependants" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Leave Request" })).toBeInTheDocument();
  });

  it("shows the 'Select a leave type' message when advancing without picking one (regression)", async () => {
    // Regression test: `leave_type`'s zod schema used to be
    // `z.number({ error: "Select a leave type" }).positive()`, whose custom
    // message only fires on a genuine type mismatch — the default value `0`
    // is still a number, so it failed `.positive()`'s own built-in message
    // instead. Fixed by using `.refine()` so this message always fires.
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("heading", { name: "Leave Request" });

    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Select a leave type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leave Request" })).toBeInTheDocument();
  });

  it("allows progressing through all steps once required fields are valid", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("heading", { name: "Leave Request" });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Annual Leave" })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("Leave Type"), "1");
    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");
    // Without travel assistance, Dependants/Travel Payment are skipped
    // entirely (straight to Review) — check it to exercise every step.
    await user.click(screen.getByLabelText("Request travel assistance"));

    // Leave Request -> Dependants
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Dependants" })).toBeInTheDocument();
    expect(screen.getByText("No dependants added yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add Dependant" }));
    // Dependant row inputs aren't associated to their <Label> via htmlFor/id,
    // so they aren't reachable by accessible name — assert on the row itself.
    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getByText("Relationship")).toBeInTheDocument();

    // Dependants -> Travel Payment Request
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Travel Route Payment Request" })).toBeInTheDocument();

    // Travel Payment Request -> Review
    await user.click(screen.getByRole("button", { name: "Next" }));
    const reviewHeading = await screen.findByRole("heading", { name: "Review & Submit" });
    const reviewSection = reviewHeading.closest("div.space-y-4") as HTMLElement;
    const dependantsRow = within(reviewSection).getByText("Dependants").closest("div") as HTMLElement;
    expect(within(dependantsRow).getByText("1")).toBeInTheDocument();
  });

  async function gotoTravelPaymentStep(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "Leave Request" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Annual Leave" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Leave Type"), "1");
    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");
    // Without travel assistance, Dependants/Travel Payment are skipped
    // entirely (straight to Review) — check it to reach Travel Payment.
    await user.click(screen.getByLabelText("Request travel assistance"));
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Dependants
    await screen.findByRole("heading", { name: "Dependants" });
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Travel Payment Request
    await screen.findByRole("heading", { name: "Travel Route Payment Request" });
  }

  it("autofills and locks a new route's From/To from the user's work station and place of domicile", async () => {
    const user = userEvent.setup();
    renderForm({ ...mockUser, place_of_domicile: "DODOMA" });
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));

    await waitFor(() => expect(screen.getByLabelText("From")).toHaveValue("HQ"));
    expect(screen.getByLabelText("From")).toBeDisabled();
    expect(screen.getByLabelText("To")).toHaveValue("Dodoma");
    expect(screen.getByLabelText("To")).toBeDisabled();
  });

  it("leaves every route after the first blank and editable for From/To", async () => {
    const user = userEvent.setup();
    renderForm({ ...mockUser, place_of_domicile: "DODOMA" });
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByLabelText("From")).toHaveValue("HQ"));

    await user.click(screen.getByRole("button", { name: "+ Add Another Route" }));

    const fromInputs = await screen.findAllByLabelText("From");
    const toInputs = screen.getAllByLabelText("To");
    expect(fromInputs).toHaveLength(2);

    // First route: still autofilled and locked, unchanged.
    expect(fromInputs[0]).toHaveValue("HQ");
    expect(fromInputs[0]).toBeDisabled();
    expect(toInputs[0]).toHaveValue("Dodoma");
    expect(toInputs[0]).toBeDisabled();

    // Second route: blank and freely editable.
    expect(fromInputs[1]).toHaveValue("");
    expect(fromInputs[1]).toBeEnabled();
    expect(toInputs[1]).toHaveValue("");
    expect(toInputs[1]).toBeEnabled();

    await user.type(fromInputs[1], "Dar es Salaam");
    await user.type(toInputs[1], "Mwanza");
    expect(fromInputs[1]).toHaveValue("Dar es Salaam");
    expect(toInputs[1]).toHaveValue("Mwanza");
  });

  it("computes route totals live from Idadi, fare, and trip type (worked examples)", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    // From is autofilled/locked from the user's work station ("HQ" in
    // mockUser) — no place_of_domicile set, so To stays blank and editable.
    await waitFor(() => expect(screen.getByLabelText("From")).toHaveValue("HQ"));
    expect(screen.getByLabelText("From")).toBeDisabled();

    const fareInput = screen.getByLabelText("Fare per Person (TZS)");
    await user.clear(fareInput);
    await user.type(fareInput, "85000");
    await user.selectOptions(screen.getByLabelText("Trip Type"), "ROUND_TRIP");

    // Idadi inputs have no accessible label (bare table cells) — they're the
    // number spinbuttons after the Fare input, one per active person type.
    const spinbuttons = screen.getAllByRole("spinbutton");
    const idadiInput = spinbuttons[spinbuttons.length - 2]; // first person-type row
    await user.clear(idadiInput);
    await user.type(idadiInput, "4");

    // fare 85,000 x idadi 4 x round-trip(2) = 680,000 (appears in the row
    // total, route subtotal, NAULI subtotal, and JUMLA KUU summary tile).
    await waitFor(() => expect(screen.getAllByText("680,000").length).toBeGreaterThan(0));
  });

  it("computes a second worked example live", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByLabelText("From")).toBeInTheDocument());
    const fareInput = screen.getByLabelText("Fare per Person (TZS)");
    await user.clear(fareInput);
    await user.type(fareInput, "40000");
    await user.selectOptions(screen.getByLabelText("Trip Type"), "ROUND_TRIP");
    const spinbuttons = screen.getAllByRole("spinbutton");
    const idadiInput = spinbuttons[spinbuttons.length - 2];
    await user.clear(idadiInput);
    await user.type(idadiInput, "2");

    // fare 40,000 x idadi 2 x round-trip(2) = 160,000
    await waitFor(() => expect(screen.getAllByText("160,000").length).toBeGreaterThan(0));
  });

  it("shows TAXI/MIZIGO as a fixed, non-editable amount set by the system administrator", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    // No SYSTEM_ADMIN configuration mocked -> neither category applies.
    expect(screen.getAllByText("Not configured by the system administrator.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "+ Add Taxi Expense" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add Luggage Item" })).not.toBeInTheDocument();
  });

  it("supports removing a route", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByText("Route 1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove Route" }));
    expect(screen.queryByText("Route 1")).not.toBeInTheDocument();
    expect(screen.getByText("No routes added yet.")).toBeInTheDocument();
  });

  it("clears an incomplete route left over from an unchecked travel assistance before submitting (regression)", async () => {
    // Regression: checking travel assistance, adding a second (blank, per
    // the "only the first route locks" behavior) route, then unchecking
    // travel assistance and jumping straight to Review used to leave that
    // blank row in form state — invisible (its step is skipped) but still
    // sent on submit, where the backend rejects it ("This field may not be
    // blank") with no clear message shown to the user.
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByLabelText("From")).toHaveValue("HQ"));
    await user.click(screen.getByRole("button", { name: "+ Add Another Route" }));
    await waitFor(() => expect(screen.getAllByLabelText("From")).toHaveLength(2));
    // Second route left blank on purpose.

    // Back to Dependants, back to Leave Request.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Dependants" });
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: "Leave Request" });

    // Uncheck travel assistance -> jumps straight to Review.
    await user.click(screen.getByLabelText("Request travel assistance"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Review & Submit" });

    const fetchSpy = global.fetch as jest.Mock;
    fetchSpy.mockClear();

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/employee/applications"));

    const createCall = fetchSpy.mock.calls.find(([req]: [Request]) => req.url.includes("/leave-applications/"));
    expect(createCall).toBeDefined();
    const body = JSON.parse(await (createCall![0] as Request).clone().text());
    expect(body.travel_routes).toEqual([]);
  });
});
