import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Role, User } from "@/types";
import type { RootState } from "@/store";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
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
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setCredentials, setUser, logout } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectCurrentUser = (state: RootState): User | null => state.auth.user;
export const selectCurrentUserRole = (state: RootState): Role | null => state.auth.user?.role ?? null;
export const selectIsAuthenticated = (state: RootState): boolean => state.auth.isAuthenticated;
export const selectAccessToken = (state: RootState): string | null => state.auth.accessToken;
