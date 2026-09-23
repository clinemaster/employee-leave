import { baseApi } from "@/lib/api/baseApi";
import type { PaginatedResponse, Role, User } from "@/types";

// SYSTEM_ADMIN write, self-read via /me/ (see /API.md "Users").
export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<
      PaginatedResponse<User>,
      { page?: number; search?: string; department?: number; role?: Role } | void
    >({
      query: (params) => ({ url: "users/", params: params ?? undefined }),
      providesTags: (result) =>
        result
          ? [...result.results.map((u) => ({ type: "Me" as const, id: u.id })), { type: "Me" as const, id: "LIST" }]
          : [{ type: "Me" as const, id: "LIST" }],
    }),
    createUser: builder.mutation<User, Partial<User> & { username: string; password?: string }>({
      query: (body) => ({ url: "users/", method: "POST", body }),
      invalidatesTags: [{ type: "Me", id: "LIST" }],
    }),
    updateUser: builder.mutation<User, Partial<User> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `users/${id}/`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "Me", id }, { type: "Me", id: "LIST" }],
    }),
  }),
});

export const { useGetUsersQuery, useCreateUserMutation, useUpdateUserMutation } = usersApi;
