import { baseApi } from "@/lib/api/baseApi";

// Organization structure — read: any authenticated user; write: SYSTEM_ADMIN
// (see /API.md "Organization"). Department and Division are parallel
// top-level units (an employee belongs to exactly one of them). Each
// resource shares the same shape family: {id, name, code, is_active} plus a
// parent FK for sections (department). Stations additionally carry `address`.

export interface Department {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}
export interface Division {
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
export interface WorkStation {
  id: number;
  name: string;
  code: string;
  address?: string;
  is_active: boolean;
}
export interface Designation {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
}

type ListResponse<T> = T[] | { results: T[] };
const toArray = <T>(r: ListResponse<T>) => (Array.isArray(r) ? r : r.results);

export const orgApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDepartments: builder.query<Department[], void>({
      query: () => "departments/",
      transformResponse: toArray<Department>,
      providesTags: ["OrgStructure"],
    }),
    createDepartment: builder.mutation<Department, Partial<Department>>({
      query: (body) => ({ url: "departments/", method: "POST", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    updateDepartment: builder.mutation<Department, Partial<Department> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `departments/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    deleteDepartment: builder.mutation<void, number>({
      query: (id) => ({ url: `departments/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgStructure"],
    }),

    getDivisions: builder.query<Division[], void>({
      query: () => "divisions/",
      transformResponse: toArray<Division>,
      providesTags: ["OrgStructure"],
    }),
    createDivision: builder.mutation<Division, Partial<Division>>({
      query: (body) => ({ url: "divisions/", method: "POST", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    updateDivision: builder.mutation<Division, Partial<Division> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `divisions/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    deleteDivision: builder.mutation<void, number>({
      query: (id) => ({ url: `divisions/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgStructure"],
    }),

    getSections: builder.query<Section[], void>({
      query: () => "sections/",
      transformResponse: toArray<Section>,
      providesTags: ["OrgStructure"],
    }),
    createSection: builder.mutation<Section, Partial<Section>>({
      query: (body) => ({ url: "sections/", method: "POST", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    updateSection: builder.mutation<Section, Partial<Section> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `sections/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgStructure"],
    }),

    getWorkStations: builder.query<WorkStation[], void>({
      query: () => "work-stations/",
      transformResponse: toArray<WorkStation>,
      providesTags: ["OrgStructure"],
    }),
    createWorkStation: builder.mutation<WorkStation, Partial<WorkStation>>({
      query: (body) => ({ url: "work-stations/", method: "POST", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    updateWorkStation: builder.mutation<WorkStation, Partial<WorkStation> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `work-stations/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    deleteWorkStation: builder.mutation<void, number>({
      query: (id) => ({ url: `work-stations/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgStructure"],
    }),

    getDesignations: builder.query<Designation[], void>({
      query: () => "designations/",
      transformResponse: toArray<Designation>,
      providesTags: ["OrgStructure"],
    }),
    createDesignation: builder.mutation<Designation, Partial<Designation>>({
      query: (body) => ({ url: "designations/", method: "POST", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    updateDesignation: builder.mutation<Designation, Partial<Designation> & { id: number }>({
      query: ({ id, ...body }) => ({ url: `designations/${id}/`, method: "PATCH", body }),
      invalidatesTags: ["OrgStructure"],
    }),
    deleteDesignation: builder.mutation<void, number>({
      query: (id) => ({ url: `designations/${id}/`, method: "DELETE" }),
      invalidatesTags: ["OrgStructure"],
    }),
  }),
});

export const {
  useGetDepartmentsQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useGetDivisionsQuery,
  useCreateDivisionMutation,
  useUpdateDivisionMutation,
  useDeleteDivisionMutation,
  useGetSectionsQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useGetWorkStationsQuery,
  useCreateWorkStationMutation,
  useUpdateWorkStationMutation,
  useDeleteWorkStationMutation,
  useGetDesignationsQuery,
  useCreateDesignationMutation,
  useUpdateDesignationMutation,
  useDeleteDesignationMutation,
} = orgApi;
