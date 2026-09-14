import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { RootState } from "@/store";
import { logout, setCredentials } from "@/store/slices/authSlice";

// TODO(api-confirm): base URL should come from env; confirm with BACKEND agent
// whether API is served at /api/ on same origin or a separate host in dev.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_BASE_URL}/api/`,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

// Wraps the base query to attempt a token refresh once on a 401, then retries.
// TODO(api-confirm): confirm refresh endpoint path + request/response field names
// (assumed POST /api/auth/refresh/ with { refresh } -> { access }).
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const state = api.getState() as RootState;
    const refreshToken = state.auth.refreshToken;

    if (refreshToken) {
      const refreshResult = await rawBaseQuery(
        {
          url: "auth/refresh/",
          method: "POST",
          body: { refresh: refreshToken },
        },
        api,
        extraOptions
      );

      if (refreshResult.data) {
        const data = refreshResult.data as { access: string };
        api.dispatch(
          setCredentials({
            accessToken: data.access,
            refreshToken,
            user: state.auth.user,
          })
        );
        result = await rawBaseQuery(args, api, extraOptions);
      } else {
        api.dispatch(logout());
      }
    } else {
      api.dispatch(logout());
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "LeaveApplications",
    "LeaveApplication",
    "Dashboard",
    "LeaveTypes",
    "LeavePolicies",
    "PersonTypes",
    "Notifications",
    "AuditTrail",
    "Documents",
    "Me",
  ],
  endpoints: () => ({}),
});
