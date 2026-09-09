import { baseApi } from "@/lib/api/baseApi";
import type { User } from "@/types";

// Matches /API.md: POST /api/auth/login/, POST /api/auth/refresh/,
// GET /api/users/me/. No logout endpoint is documented — logging out is a
// client-only action (clear tokens + Redux state), handled in AppShell.
interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "auth/login/",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Me"],
    }),
    me: builder.query<User, void>({
      query: () => "users/me/",
      providesTags: ["Me"],
    }),
  }),
});

export const { useLoginMutation, useMeQuery } = authApi;
