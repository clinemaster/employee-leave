import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Role, User } from "@/types";
import type { RootState } from "@/store";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  // False until the client has checked localStorage for persisted tokens
  // (see AuthHydrator). Always false during SSR and the initial client
  // render, so RoleGuard can avoid both a hydration mismatch and a
  // premature redirect-to-login flash for an already-logged-in user.
  hydrated: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  hydrated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ accessToken: string; refreshToken: string | null; user: User | null }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.user = action.payload.user;
      state.isAuthenticated = Boolean(action.payload.accessToken);
      state.hydrated = true;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    hydrateFromStorage: (
      state,
      action: PayloadAction<{ accessToken: string | null; refreshToken: string | null }>
    ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = Boolean(action.payload.accessToken);
      state.hydrated = true;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.hydrated = true;
    },
  },
});

export const { setCredentials, setUser, hydrateFromStorage, logout } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectCurrentUser = (state: RootState): User | null => state.auth.user;
export const selectCurrentUserRole = (state: RootState): Role | null => state.auth.user?.role ?? null;
export const selectIsAuthenticated = (state: RootState): boolean => state.auth.isAuthenticated;
export const selectAccessToken = (state: RootState): string | null => state.auth.accessToken;
export const selectAuthHydrated = (state: RootState): boolean => state.auth.hydrated;
