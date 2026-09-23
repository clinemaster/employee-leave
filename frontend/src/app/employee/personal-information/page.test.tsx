import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "@/store";
import { setCredentials } from "@/store/slices/authSlice";
import PersonalInformationPage from "./page";
import type { User } from "@/types";

// Smoke test: the fields that used to be Step 1 ("Personal Info") of the
// leave application wizard are now shown here instead, read-only, sourced
// from the user's profile.

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/employee/personal-information",
}));

const mockUser: User = {
  id: 1,
  username: "jdoe",
  full_name: "Jane Doe",
  email: "jdoe@example.com",
  role: "EMPLOYEE",
  check_number: "CN1",
  personnel_file_number: "PF1",
  place_of_domicile: "DODOMA",
  department: 1,
  department_name: "IT",
  work_station: 1,
  work_station_name: "HQ",
  designation: 1,
  designation_name: "Officer",
  is_active: true,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function renderPage() {
  global.fetch = jest.fn().mockImplementation(() => Promise.resolve(jsonResponse([]))) as unknown as typeof fetch;
  const store = makeStore();
  store.dispatch(setCredentials({ accessToken: "tok", refreshToken: null, user: mockUser }));
  render(
    <Provider store={store}>
      <PersonalInformationPage />
    </Provider>
  );
}

describe("PersonalInformationPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the applicant's profile details, read-only", () => {
    renderPage();
    // "Personal Information" also appears as the sidebar nav link, so assert
    // on the page heading specifically rather than the ambiguous text. Scope
    // the field assertions to <main> too — the header's "Welcome {full_name}"
    // greeting also renders the applicant's name (AppShell), so an
    // unscoped getByText("Jane Doe") would match twice.
    expect(screen.getByRole("heading", { name: "Personal Information" })).toBeInTheDocument();
    const main = within(screen.getByRole("main"));
    expect(main.getByText("Jane Doe")).toBeInTheDocument();
    expect(main.getByText("CN1")).toBeInTheDocument();
    expect(main.getByText("PF1")).toBeInTheDocument();
    expect(main.getByText("Dodoma")).toBeInTheDocument();
    expect(main.getByText("IT")).toBeInTheDocument();
    expect(main.getByText("HQ")).toBeInTheDocument();
    expect(main.getByText("Officer")).toBeInTheDocument();
  });
});
