"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api/errors";
import {
  useCreateDepartmentMutation,
  useCreateDesignationMutation,
  useCreateDivisionMutation,
  useCreateSectionMutation,
  useCreateSupportDivisionMutation,
  useCreateUnitMutation,
  useCreateWorkStationMutation,
  useDeleteDepartmentMutation,
  useDeleteDesignationMutation,
  useDeleteDivisionMutation,
  useDeleteSupportDivisionMutation,
  useDeleteWorkStationMutation,
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
  useGetDivisionsQuery,
  useGetSectionsQuery,
  useGetSupportDivisionsQuery,
  useGetUnitsQuery,
  useGetWorkStationsQuery,
  useUpdateDepartmentMutation,
  useUpdateDesignationMutation,
  useUpdateDivisionMutation,
  useUpdateSectionMutation,
  useUpdateSupportDivisionMutation,
  useUpdateUnitMutation,
  useUpdateWorkStationMutation,
} from "@/features/departments/orgApi";
import type { WorkStation } from "@/features/departments/orgApi";

// Basic admin CRUD (list + create/edit/delete) for departments, divisions,
// support divisions, sections, units, work stations, designations —
// /api/{departments,divisions,support-divisions,sections,units,work-stations,designations}/
// (SYSTEM_ADMIN write). An employee belongs to exactly one of Department,
// Division or Support Division, plus exactly one Work Station.
export default function AdminOrganizationPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Organization Structure</h1>
      <div className="space-y-6">
        <NamedUnitPanel
          title="Departments"
          useList={useGetDepartmentsQuery}
          useCreate={useCreateDepartmentMutation}
          useUpdate={useUpdateDepartmentMutation}
          useDelete={useDeleteDepartmentMutation}
        />
        <NamedUnitPanel
          title="Divisions"
          useList={useGetDivisionsQuery}
          useCreate={useCreateDivisionMutation}
          useUpdate={useUpdateDivisionMutation}
          useDelete={useDeleteDivisionMutation}
        />
        <NamedUnitPanel
          title="Support Divisions"
          useList={useGetSupportDivisionsQuery}
          useCreate={useCreateSupportDivisionMutation}
          useUpdate={useUpdateSupportDivisionMutation}
          useDelete={useDeleteSupportDivisionMutation}
        />
        <NamedUnitPanel
          title="Designations"
          useList={useGetDesignationsQuery}
          useCreate={useCreateDesignationMutation}
          useUpdate={useUpdateDesignationMutation}
          useDelete={useDeleteDesignationMutation}
        />
        <SectionsPanel />
        <UnitsPanel />
        <WorkStationsPanel />
      </div>
    </AppShell>
  );
}

type NamedUnit = { id: number; name: string; code: string; is_active: boolean };

// Shared panel for the three flat, parent-less org units (Department,
// Division, Support Division): create + inline edit + delete.
function NamedUnitPanel({
  title,
  useList,
  useCreate,
  useUpdate,
  useDelete,
}: {
  title: string;
  useList: () => { data?: NamedUnit[]; isLoading: boolean };
  useCreate: () => readonly [
    (body: Partial<NamedUnit>) => { unwrap: () => Promise<NamedUnit> },
    unknown,
  ];
  useUpdate: () => readonly [
    (body: Partial<NamedUnit> & { id: number }) => { unwrap: () => Promise<NamedUnit> },
    unknown,
  ];
  useDelete: () => readonly [(id: number) => { unwrap: () => Promise<void> }, unknown];
}) {
  const { data, isLoading } = useList();
  const [create] = useCreate();
  const [update] = useUpdate();
  const [remove] = useDelete();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  async function handleCreate() {
    setCreateError(null);
    try {
      await create({ name, code, is_active: true }).unwrap();
      setName("");
      setCode("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create. Please try again."));
    }
  }

  function startEdit(row: NamedUnit) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCode(row.code);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditError(null);
    try {
      await update({ id, name: editName, code: editCode }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(extractErrorMessage(err, "Failed to save changes."));
    }
  }

  async function handleDelete(row: NamedUnit) {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await remove(row.id).unwrap();
    } catch (err) {
      window.alert(extractErrorMessage(err, "Failed to delete."));
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button disabled={!name.trim() || !code.trim()} onClick={handleCreate}>
          Add
        </Button>
      </div>
      {createError ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {createError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">None yet.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4">S/No</th>
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) =>
              editingId === row.id ? (
                <tr key={row.id}>
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">
                    <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                  </td>
                  <td className="py-2 pr-4">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td className="py-2 pr-4">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <Button
                          disabled={!editName.trim() || !editCode.trim()}
                          onClick={() => saveEdit(row.id)}
                        >
                          Save
                        </Button>
                        <Button variant="secondary" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                      {editError ? <p className="text-xs text-red-700">{editError}</p> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id}>
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">{row.code}</td>
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => handleDelete(row)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
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

function WorkStationsPanel() {
  const { data, isLoading } = useGetWorkStationsQuery();
  const [create] = useCreateWorkStationMutation();
  const [update] = useUpdateWorkStationMutation();
  const [remove] = useDeleteWorkStationMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  async function handleCreate() {
    setCreateError(null);
    try {
      await create({ name, code, address, is_active: true }).unwrap();
      setName("");
      setCode("");
      setAddress("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create. Please try again."));
    }
  }

  function startEdit(row: WorkStation) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCode(row.code);
    setEditAddress(row.address ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditError(null);
    try {
      await update({ id, name: editName, code: editCode, address: editAddress }).unwrap();
      setEditingId(null);
    } catch (err) {
      setEditError(extractErrorMessage(err, "Failed to save changes."));
    }
  }

  async function handleDelete(row: WorkStation) {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    try {
      await remove(row.id).unwrap();
    } catch (err) {
      window.alert(extractErrorMessage(err, "Failed to delete."));
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Work Stations</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button disabled={!name.trim() || !code.trim()} onClick={handleCreate}>
          Add
        </Button>
      </div>
      {createError ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {createError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">None yet.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4">S/No</th>
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Address</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) =>
              editingId === row.id ? (
                <tr key={row.id}>
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">
                    <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                  </td>
                  <td className="py-2 pr-4">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td className="py-2 pr-4">
                    <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
                  </td>
                  <td className="py-2 pr-4">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <Button
                          disabled={!editName.trim() || !editCode.trim()}
                          onClick={() => saveEdit(row.id)}
                        >
                          Save
                        </Button>
                        <Button variant="secondary" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                      {editError ? <p className="text-xs text-red-700">{editError}</p> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id}>
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4">{row.code}</td>
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">{row.address || "—"}</td>
                  <td className="py-2 pr-4">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => handleDelete(row)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
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
          <th className="py-2 pr-4">S/No</th>
          <th className="py-2 pr-4">Code</th>
          <th className="py-2 pr-4">Name</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, index) => (
          <tr key={r.id}>
            <td className="py-2 pr-4">{index + 1}</td>
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
