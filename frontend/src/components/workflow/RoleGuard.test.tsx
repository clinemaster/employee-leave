import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { RoleGuard } from "./RoleGuard";
import authReducer from "@/store/slices/authSlice";
import uiReducer from "@/store/slices/uiSlice";
import notificationReducer from "@/store/slices/notificationSlice";
import { baseApi } from "@/lib/api/baseApi";
import type { User } from "@/types";

const replace = jest.fn();
let currentPathname = "/employee/applications";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => currentPathname,
}));

function renderWithState(authState: {
  user: User | null;
  isAuthenticated: boolean;
}) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      ui: uiReducer,
      notifications: notificationReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      auth: { user: authState.user, accessToken: null, refreshToken: null, isAuthenticated: authState.isAuthenticated },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });

  return render(
    <Provider store={store}>
      <RoleGuard>
        <div>protected-content</div>
      </RoleGuard>
    </Provider>
  );
}

function makeUser(role: User["role"]): User {
  return {
    id: 1,
    username: "u",
    full_name: "U",
    email: "u@example.com",
    role,
    is_active: true,
  };
}

describe("RoleGuard", () => {
  beforeEach(() => {
    replace.mockClear();
    currentPathname = "/employee/applications";
  });

  it("redirects to /login with a next param when unauthenticated, and renders nothing", () => {
    renderWithState({ user: null, isAuthenticated: false });
    expect(replace).toHaveBeenCalledWith("/login?next=%2Femployee%2Fapplications");
    expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated and role is allowed on the route", () => {
    renderWithState({ user: makeUser("EMPLOYEE"), isAuthenticated: true });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("protected-content")).toBeInTheDocument();
  });

  it("redirects to /dashboard when authenticated but role is not allowed on the route", () => {
    currentPathname = "/admin/leave-types";
    renderWithState({ user: makeUser("EMPLOYEE"), isAuthenticated: true });
    expect(replace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
  });

  it("allows SYSTEM_ADMIN onto the /hod prefix per routeRoleMap", () => {
    currentPathname = "/hod/applications";
    renderWithState({ user: makeUser("SYSTEM_ADMIN"), isAuthenticated: true });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("protected-content")).toBeInTheDocument();
  });
});
