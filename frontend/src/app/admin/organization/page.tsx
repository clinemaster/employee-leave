"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  useCreateDepartmentMutation,
  useCreateSectionMutation,
  useCreateStationMutation,
  useCreateUnitMutation,
  useGetDepartmentsQuery,
  useGetSectionsQuery,
  useGetStationsQuery,
  useGetUnitsQuery,
  useUpdateDepartmentMutation,
  useUpdateSectionMutation,
  useUpdateStationMutation,
  useUpdateUnitMutation,
} from "@/features/departments/orgApi";

// Basic admin CRUD (list + create/edit) for departments, sections, units,
// stations — /api/{departments,sections,units,stations}/ (SYSTEM_ADMIN write).
export default function AdminOrganizationPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Organization Structure</h1>
      <div className="space-y-6">
        <DepartmentsPanel />
        <SectionsPanel />
        <UnitsPanel />
        <StationsPanel />
      </div>
    </AppShell>
  );
}

function DepartmentsPanel() {
  const { data, isLoading } = useGetDepartmentsQuery();
  const [create] = useCreateDepartmentMutation();
  const [update] = useUpdateDepartmentMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Departments</h2>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button
          disabled={!name.trim() || !code.trim()}
          onClick={async () => {
            await create({ name, code, is_active: true }).unwrap();
            setName("");
            setCode("");
          }}
        >
          Add
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <SimpleTable
          rows={data ?? []}
          onToggleActive={(id, is_active) => update({ id, is_active })}
        />
      )}
    </Card>
  );
}

function SectionsPanel() {
  const { data: sections, isLoading } = useGetSectionsQuery();
  const { data: departments } = useGetDepartmentsQuery();
  const [create] = useCreateSectionMutation();
  const [update] = useUpdateSectionMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Sections</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">Department...</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Button
          disabled={!name.trim() || !code.trim() || !department}
          onClick={async () => {
            await create({ name, code, department: Number(department), is_active: true }).unwrap();
            setName("");
            setCode("");
            setDepartment("");
          }}
        >
          Add
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <SimpleTable rows={sections ?? []} onToggleActive={(id, is_active) => update({ id, is_active })} />
      )}
    </Card>
  );
}

function UnitsPanel() {
  const { data: units, isLoading } = useGetUnitsQuery();
  const { data: sections } = useGetSectionsQuery();
  const [create] = useCreateUnitMutation();
  const [update] = useUpdateUnitMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [section, setSection] = useState("");

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Units</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">Section...</option>
          {sections?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          disabled={!name.trim() || !code.trim() || !section}
          onClick={async () => {
            await create({ name, code, section: Number(section), is_active: true }).unwrap();
            setName("");
            setCode("");
            setSection("");
          }}
        >
          Add
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <SimpleTable rows={units ?? []} onToggleActive={(id, is_active) => update({ id, is_active })} />
      )}
    </Card>
  );
}

function StationsPanel() {
  const { data, isLoading } = useGetStationsQuery();
  const [create] = useCreateStationMutation();
  const [update] = useUpdateStationMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Stations</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button
          disabled={!name.trim() || !code.trim()}
          onClick={async () => {
            await create({ name, code, address, is_active: true }).unwrap();
            setName("");
            setCode("");
            setAddress("");
          }}
        >
          Add
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <SimpleTable rows={data ?? []} onToggleActive={(id, is_active) => update({ id, is_active })} />
      )}
    </Card>
  );
}

function SimpleTable({
  rows,
  onToggleActive,
}: {
  rows: { id: number; name: string; code: string; is_active: boolean }[];
  onToggleActive: (id: number, is_active: boolean) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">None yet.</p>;
  return (
    <table className="min-w-full divide-y divide-gray-200 text-sm">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="py-2 pr-4">Code</th>
          <th className="py-2 pr-4">Name</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-2 pr-4">{r.code}</td>
            <td className="py-2 pr-4">{r.name}</td>
            <td className="py-2 pr-4">{r.is_active ? "Active" : "Inactive"}</td>
            <td className="py-2 pr-4">
              <Button variant="secondary" onClick={() => onToggleActive(r.id, !r.is_active)}>
                {r.is_active ? "Deactivate" : "Activate"}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
