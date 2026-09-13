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

function renderForm() {
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
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

  it("renders step 1 pre-filled from the current user, read-only", async () => {
    renderForm();
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("CN1")).toBeInTheDocument();
  });

  it("blocks advancing past step 2 when leave type / dates are missing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Leave Request" })).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Leave Request" });

    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Select a leave type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leave Request" })).toBeInTheDocument();
  });

  it("navigates Next -> Back and preserves step 1 content", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Leave Request" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Personal Information")).toBeInTheDocument();
  });

  it("allows progressing through all steps once required fields are valid", async () => {
    const user = userEvent.setup();
    renderForm();

    // Step 1 -> 2
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Leave Request" });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Annual Leave" })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("Leave Type"), "1");
    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");

    // Step 2 -> 3 (Dependants)
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Dependants" })).toBeInTheDocument();
    expect(screen.getByText("No dependants added yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add Dependant" }));
    // Dependant row inputs aren't associated to their <Label> via htmlFor/id,
    // so they aren't reachable by accessible name — assert on the row itself.
    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getByText("Relationship")).toBeInTheDocument();

    // Step 3 -> 4 (Travel Payment Request)
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Travel Payment Request" })).toBeInTheDocument();

    // Step 4 -> 5 (Review)
    await user.click(screen.getByRole("button", { name: "Next" }));
    const reviewHeading = await screen.findByRole("heading", { name: "Review & Submit" });
    const reviewSection = reviewHeading.closest("div.space-y-4") as HTMLElement;
    const dependantsRow = within(reviewSection).getByText("Dependants").closest("div") as HTMLElement;
    expect(within(dependantsRow).getByText("1")).toBeInTheDocument();
  });

  async function gotoTravelPaymentStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Leave Request
    await screen.findByRole("heading", { name: "Leave Request" });
    await waitFor(() => expect(screen.getByRole("option", { name: "Annual Leave" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Leave Type"), "1");
    await user.type(screen.getByLabelText("Start Date"), "2026-02-01");
    await user.type(screen.getByLabelText("End Date"), "2026-02-05");
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Dependants
    await screen.findByRole("heading", { name: "Dependants" });
    await user.click(screen.getByRole("button", { name: "Next" })); // -> Travel Payment Request
    await screen.findByRole("heading", { name: "Travel Payment Request" });
  }

  it("computes route totals live from Idadi, fare, and trip type (worked examples)", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByLabelText("From")).toBeInTheDocument());

    await user.type(screen.getByLabelText("From"), "Arusha");
    await user.type(screen.getByLabelText("To"), "Dodoma");
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

  it("computes a second worked example and taxi totals live", async () => {
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

    await user.click(screen.getByRole("button", { name: "+ Add Taxi Expense" }));
    const tripsInput = screen.getByLabelText("Number of Trips");
    const costInput = screen.getByLabelText("Cost per Trip (TZS)");
    await user.clear(tripsInput);
    await user.type(tripsInput, "2");
    await user.clear(costInput);
    await user.type(costInput, "100000");

    // 2 x 100,000 = 200,000
    await waitFor(() => expect(screen.getAllByText("200,000").length).toBeGreaterThan(0));
  });

  it("supports removing a route and a taxi expense", async () => {
    const user = userEvent.setup();
    renderForm();
    await gotoTravelPaymentStep(user);

    await user.click(screen.getByRole("button", { name: "+ Add Route" }));
    await waitFor(() => expect(screen.getByText("Route 1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove Route" }));
    expect(screen.queryByText("Route 1")).not.toBeInTheDocument();
    expect(screen.getByText("No routes added yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add Taxi Expense" }));
    expect(screen.getByLabelText("Number of Trips")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByLabelText("Number of Trips")).not.toBeInTheDocument();
    expect(screen.getByText("No taxi expenses added yet.")).toBeInTheDocument();
  });
});
