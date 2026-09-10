import { baseApi } from "@/lib/api/baseApi";
import type { User } from "@/types";

// Matches /API.md: POST /api/auth/login/, POST /api/auth/refresh/,
// GET /api/users/me/. No logout endpoint is documented — logging out is a
// client-only action (clear tokens + Redux state), handled in AppShell.
interface LoginRequest {
  username: string;
  password: string;
}

interface LoginSuccessResponse {
  access: string;
  refresh: string;
  user: User;
}

// If the account has MFA enabled, /api/auth/login/ returns this challenge
// instead of tokens — no `access`/`refresh` present. The client then calls
// mfaLoginVerify with the returned `mfa_token` + a TOTP code.
interface MfaChallengeResponse {
  mfa_required: true;
  mfa_token: string;
}

export type LoginResponse = LoginSuccessResponse | MfaChallengeResponse;

export function isMfaChallenge(response: LoginResponse): response is MfaChallengeResponse {
  return "mfa_required" in response && response.mfa_required === true;
}

interface MfaLoginVerifyRequest {
  mfa_token: string;
  code: string;
}

interface MfaSetupResponse {
  secret: string;
  provisioning_uri: string;
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
    mfaLoginVerify: builder.mutation<LoginSuccessResponse, MfaLoginVerifyRequest>({
      query: (body) => ({
        url: "auth/mfa/login-verify/",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Me"],
    }),
    mfaSetup: builder.mutation<MfaSetupResponse, void>({
      query: () => ({ url: "auth/mfa/setup/", method: "POST" }),
    }),
    mfaVerifySetup: builder.mutation<User, { code: string }>({
      query: (body) => ({ url: "auth/mfa/verify-setup/", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
    mfaDisable: builder.mutation<User, { password: string }>({
      query: (body) => ({ url: "auth/mfa/disable/", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
    me: builder.query<User, void>({
      query: () => "users/me/",
      providesTags: ["Me"],
    }),
  }),
});

export const {
  useLoginMutation,
  useMfaLoginVerifyMutation,
  useMfaSetupMutation,
  useMfaVerifySetupMutation,
  useMfaDisableMutation,
  useMeQuery,
} = authApi;
