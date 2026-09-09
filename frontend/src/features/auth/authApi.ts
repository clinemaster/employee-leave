import { baseApi } from "@/lib/api/baseApi";
import type { User } from "@/types";

// TODO(api-confirm): endpoint paths + payload/response shapes to be confirmed
// with BACKEND agent (djangorestframework-simplejwt style assumed).
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
  user?: User;
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
      query: () => "auth/me/",
      providesTags: ["Me"],
    }),
    logout: builder.mutation<void, { refresh: string } | void>({
      query: (body) => ({
        url: "auth/logout/",
        method: "POST",
        body: body ?? undefined,
      }),
    }),
  }),
});

export const { useLoginMutation, useMeQuery, useLogoutMutation } = authApi;
