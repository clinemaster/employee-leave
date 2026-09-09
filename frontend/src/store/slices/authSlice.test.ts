import authReducer, {
  setCredentials,
  setUser,
  logout,
  selectCurrentUser,
  selectCurrentUserRole,
  selectIsAuthenticated,
  selectAccessToken,
} from "./authSlice";
import type { User } from "@/types";
import type { RootState } from "@/store";

const mockUser: User = {
  id: 1,
  username: "jdoe",
  full_name: "Jane Doe",
  email: "jdoe@example.com",
  role: "EMPLOYEE",
  is_active: true,
};

describe("authSlice", () => {
  it("returns the initial state", () => {
    const state = authReducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  });

  it("setCredentials populates tokens/user and marks authenticated when accessToken present", () => {
    const state = authReducer(
      undefined,
      setCredentials({ accessToken: "access-123", refreshToken: "refresh-456", user: mockUser })
    );
    expect(state.accessToken).toBe("access-123");
    expect(state.refreshToken).toBe("refresh-456");
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("setCredentials with a falsy accessToken marks isAuthenticated false", () => {
    const state = authReducer(
      undefined,
      setCredentials({ accessToken: "", refreshToken: null, user: null })
    );
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it("setUser updates the user and marks authenticated", () => {
    const state = authReducer(undefined, setUser(mockUser));
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("logout resets to a logged-out state even from a populated state", () => {
    const populated = authReducer(
      undefined,
      setCredentials({ accessToken: "access-123", refreshToken: "refresh-456", user: mockUser })
    );
    const state = authReducer(populated, logout());
    expect(state).toEqual({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  });

  describe("selectors", () => {
    const rootState = {
      auth: {
        user: mockUser,
        accessToken: "tok",
        refreshToken: "ref",
        isAuthenticated: true,
      },
    } as unknown as RootState;

    it("selectCurrentUser returns the user", () => {
      expect(selectCurrentUser(rootState)).toEqual(mockUser);
    });

    it("selectCurrentUserRole returns the user's role", () => {
      expect(selectCurrentUserRole(rootState)).toBe("EMPLOYEE");
    });

    it("selectCurrentUserRole returns null when there is no user", () => {
      const empty = { auth: { user: null, accessToken: null, refreshToken: null, isAuthenticated: false } } as unknown as RootState;
      expect(selectCurrentUserRole(empty)).toBeNull();
    });

    it("selectIsAuthenticated / selectAccessToken read straight through", () => {
      expect(selectIsAuthenticated(rootState)).toBe(true);
      expect(selectAccessToken(rootState)).toBe("tok");
    });
  });
});
