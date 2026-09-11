import { baseApi } from "@/lib/api/baseApi";
import type { PersonType } from "@/types";

// Wahusika (traveler) catalog for the Travel Payment Request step's NAULI
// section — read: any authenticated user, write: SYSTEM_ADMIN only (enforced
// server-side). Follows catalogApi.ts's leave-types pattern exactly,
// including the bulk reorder endpoint. Field names/shape agreed with BACKEND
// ahead of their API.md update landing — reconcile if it differs.
export const personTypesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPersonTypes: builder.query<PersonType[], void>({
      query: () => "person-types/",
      providesTags: ["PersonTypes"],
      transformResponse: (response: PersonType[] | { results: PersonType[] }) =>
        Array.isArray(response) ? response : response.results,
    }),
    createPersonType: builder.mutation<PersonType, Partial<PersonType>>({
      query: (body) => ({ url: "person-types/", method: "POST", body }),
      invalidatesTags: ["PersonTypes"],
    }),
    updatePersonType: builder.mutation<PersonType, Partial<PersonType> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `person-types/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["PersonTypes"],
    }),
    deactivatePersonType: builder.mutation<PersonType, { id: number }>({
      query: ({ id }) => ({ url: `person-types/${id}/`, method: "PATCH", body: { is_active: false } }),
      invalidatesTags: ["PersonTypes"],
    }),
    // POST /api/person-types/reorder/ — bulk sort_order update, mirrors
    // leave-types/reorder/.
    reorderPersonTypes: builder.mutation<PersonType[], { id: number; sort_order: number }[]>({
      query: (body) => ({ url: "person-types/reorder/", method: "POST", body }),
      invalidatesTags: ["PersonTypes"],
    }),
  }),
});

export const {
  useGetPersonTypesQuery,
  useCreatePersonTypeMutation,
  useUpdatePersonTypeMutation,
  useDeactivatePersonTypeMutation,
  useReorderPersonTypesMutation,
} = personTypesApi;
