import { baseApi } from "@/lib/api/baseApi";

// Organization structure — read: any authenticated user; write: SYSTEM_ADMIN
// (see /API.md "Organization"). Each resource shares the same shape family:
// {id, name, code, is_active} plus a parent FK for sections (department) and
// units (section). Stations additionally carry `address`.

export interface Department {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}
export interface Section {
  id: number;
  name: string;
  code: string;
  department: number;
  is_active: boolean;
}
export interface Unit {
  id: number;
  name: string;
  code: string;
  section: number;
  is_active: boolean;
}
export interface Station {
  id: number;
  name: string;
  code: string;
  address?: string;
  is_active: boolean;
}

type ListResponse<T> = T[] | { results: T[] };
const toArray = <T>(r: ListResponse<T>) => (Array.isArray(r) ? r : r.results);

export const orgApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDepartments: builder.query<Department[], void>({
      query: () => "departments/",
      transformResponse: toArray<Department>,
      providesTags: ["Dashboard"],
    }),
    createDepartment: builder.mutation<Department, Partial<Department>>({
      query: (body) => ({ url: "departments/", method: "POST", body }),
      invalidatesTags: ["Dashboard"],
    }),
    updateDepartment: builder.mutation<Department, Partial<Department> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `departments/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["Dashboard"],
    }),

    getSections: builder.query<Section[], void>({
      query: () => "sections/",
      transformResponse: toArray<Section>,
      providesTags: ["Dashboard"],
    }),
    createSection: builder.mutation<Section, Partial<Section>>({
      query: (body) => ({ url: "sections/", method: "POST", body }),
      invalidatesTags: ["Dashboard"],
    }),
    updateSection: builder.mutation<Section, Partial<Section> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `sections/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["Dashboard"],
    }),

    getUnits: builder.query<Unit[], void>({
      query: () => "units/",
      transformResponse: toArray<Unit>,
      providesTags: ["Dashboard"],
    }),
    createUnit: builder.mutation<Unit, Partial<Unit>>({
      query: (body) => ({ url: "units/", method: "POST", body }),
      invalidatesTags: ["Dashboard"],
    }),
    updateUnit: builder.mutation<Unit, Partial<Unit> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `units/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["Dashboard"],
    }),

    getStations: builder.query<Station[], void>({
      query: () => "stations/",
      transformResponse: toArray<Station>,
      providesTags: ["Dashboard"],
    }),
    createStation: builder.mutation<Station, Partial<Station>>({
      query: (body) => ({ url: "stations/", method: "POST", body }),
      invalidatesTags: ["Dashboard"],
    }),
    updateStation: builder.mutation<Station, Partial<Station> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `stations/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["Dashboard"],
    }),
  }),
});

export const {
  useGetDepartmentsQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useGetSectionsQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  useGetStationsQuery,
  useCreateStationMutation,
  useUpdateStationMutation,
} = orgApi;
