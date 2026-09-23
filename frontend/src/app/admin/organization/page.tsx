"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/lib/api/errors";
import { useGetUsersQuery, useUpdateUserMutation } from "@/features/users/usersApi";
import { allUserRoles } from "@/types";
import type { User } from "@/types";
import {
  useCreateDepartmentMutation,
  useCreateDesignationMutation,
  useCreateDivisionMutation,
  useCreateWorkStationMutation,
  useDeleteDepartmentMutation,
  useDeleteDesignationMutation,
  useDeleteDivisionMutation,
  useDeleteWorkStationMutation,
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
  useGetDivisionsQuery,
  useGetWorkStationsQuery,
  useUpdateDepartmentMutation,
  useUpdateDesignationMutation,
  useUpdateDivisionMutation,
  useUpdateWorkStationMutation,
} from "@/features/departments/orgApi";
import type { WorkStation } from "@/features/departments/orgApi";

// Basic admin CRUD (list + create/edit/delete) for departments, divisions,
// work stations, designations —
// /api/{departments,divisions,work-stations,designations}/
// (SYSTEM_ADMIN write). An employee belongs to exactly one of Department or
// Division, plus exactly one Work Station.
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
        <DepartmentHodPanel />
        <NamedUnitPanel
          title="Divisions"
          useList={useGetDivisionsQuery}
          useCreate={useCreateDivisionMutation}
          useUpdate={useUpdateDivisionMutation}
          useDelete={useDeleteDivisionMutation}
        />
        <NamedUnitPanel
          title="Designations"
          useList={useGetDesignationsQuery}
          useCreate={useCreateDesignationMutation}
          useUpdate={useUpdateDesignationMutation}
          useDelete={useDeleteDesignationMutation}
        />
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

function WorkStationsPanel() {
  const { data, isLoading } = useGetWorkStationsQuery();
  const { data: divisions } = useGetDivisionsQuery();
  const [create] = useCreateWorkStationMutation();
  const [update] = useUpdateWorkStationMutation();
  const [remove] = useDeleteWorkStationMutation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [division, setDivision] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editDivision, setEditDivision] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  async function handleCreate() {
    setCreateError(null);
    try {
      await create({
        name, code, address, is_active: true,
        division: division ? Number(division) : null,
      }).unwrap();
      setName("");
      setCode("");
      setAddress("");
      setDivision("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create. Please try again."));
    }
  }

  function startEdit(row: WorkStation) {
    setEditingId(row.id);
    setEditName(row.name);
    setEditCode(row.code);
    setEditAddress(row.address ?? "");
    setEditDivision(row.division != null ? String(row.division) : "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditError(null);
    try {
      await update({
        id, name: editName, code: editCode, address: editAddress,
        division: editDivision ? Number(editDivision) : null,
      }).unwrap();
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
      <p className="mb-3 text-xs text-gray-500">
        A work station&apos;s parent Division (optional) is used to route a Chief External
        Auditor&apos;s own leave to that Division&apos;s existing AAG.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={division}
          onChange={(e) => setDivision(e.target.value)}
        >
          <option value="">No parent division</option>
          {divisions?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
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
              <th className="py-2 pr-4">Division</th>
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
                  <td className="py-2 pr-4">
                    <select
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      value={editDivision}
                      onChange={(e) => setEditDivision(e.target.value)}
                    >
                      <option value="">None</option>
                      {divisions?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
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
                  <td className="py-2 pr-4">{row.division_name || "—"}</td>
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

// Lets SYSTEM_ADMIN assign HEAD_OF_DEPARTMENT to any existing member of a
// department (the backend only allows granting the role to someone who
// already belongs to that department — see accounts.serializers.
// _validate_hod_requires_existing_department_member — so this reads the
// department's own member list rather than the general Manage Users table).
function DepartmentHodPanel() {
  const { data: departments, isLoading } = useGetDepartmentsQuery();
  const [managingDept, setManagingDept] = useState<{ id: number; name: string } | null>(null);

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-gray-900">Department Heads</h2>
      <p className="mb-3 text-xs text-gray-500">
        HEAD_OF_DEPARTMENT can only be granted to someone who already belongs to the department —
        move them into the department first (Manage Users) if they aren't a member yet.
      </p>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : !departments || departments.length === 0 ? (
        <p className="text-sm text-gray-500">No departments yet.</p>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 pr-4">Department</th>
              <th className="py-2 pr-4">Head of Department</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {departments.map((dept) => (
              <DepartmentHodRow
                key={dept.id}
                department={dept}
                onManage={() => setManagingDept({ id: dept.id, name: dept.name })}
              />
            ))}
          </tbody>
        </table>
      )}
      {managingDept ? (
        <DepartmentHodModal department={managingDept} onClose={() => setManagingDept(null)} />
      ) : null}
    </Card>
  );
}

function DepartmentHodRow({
  department,
  onManage,
}: {
  department: { id: number; name: string };
  onManage: () => void;
}) {
  const { data, isLoading } = useGetUsersQuery({ department: department.id });
  const hod = data?.results.find((u) => allUserRoles(u).includes("HEAD_OF_DEPARTMENT"));

  return (
    <tr>
      <td className="py-2 pr-4">{department.name}</td>
      <td className="py-2 pr-4">
        {isLoading ? (
          "..."
        ) : hod ? (
          hod.full_name
        ) : (
          <span className="text-amber-600">Vacant</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <Button variant="secondary" onClick={onManage}>
          Manage HOD
        </Button>
      </td>
    </tr>
  );
}

function DepartmentHodModal({
  department,
  onClose,
}: {
  department: { id: number; name: string };
  onClose: () => void;
}) {
  const { data, isLoading } = useGetUsersQuery({ department: department.id });
  const [updateUser, { isLoading: isSaving }] = useUpdateUserMutation();
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);

  const members = data?.results ?? [];
  const hod = members.find((u) => allUserRoles(u).includes("HEAD_OF_DEPARTMENT"));

  async function makeHod(member: User) {
    setError(null);
    setActingOn(member.id);
    try {
      const nextAdditional = Array.from(
        new Set([...(member.additional_roles ?? []), "HEAD_OF_DEPARTMENT" as const])
      ).filter((r) => r !== member.role);
      // Explicitly re-assert department (and clear division/work_station) on
      // every action here, not just when the org unit picker is touched --
      // self-heals any pre-existing stray division/work_station value on the
      // record (legacy data from before the single-org-unit rule existed)
      // instead of letting it silently block this member's own department.
      await updateUser({
        id: member.id, additional_roles: nextAdditional,
        department: department.id, division: null, work_station: null,
      }).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to assign HOD."));
    } finally {
      setActingOn(null);
    }
  }

  async function removeHod(member: User) {
    setError(null);
    setActingOn(member.id);
    try {
      const orgUnitFields = { department: department.id, division: null, work_station: null };
      if (member.role === "HEAD_OF_DEPARTMENT") {
        await updateUser({ id: member.id, role: "EMPLOYEE", ...orgUnitFields }).unwrap();
      } else {
        await updateUser({
          id: member.id,
          additional_roles: (member.additional_roles ?? []).filter((r) => r !== "HEAD_OF_DEPARTMENT"),
          ...orgUnitFields,
        }).unwrap();
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to remove HOD."));
    } finally {
      setActingOn(null);
    }
  }

  return (
    <Modal title={`Head of Department — ${department.name}`} onClose={onClose}>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-500">No members belong to this department yet.</p>
      ) : (
        <>
          {hod ? (
            <div className="mb-3 flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-sm">
              <span>
                Current head: <span className="font-semibold">{hod.full_name}</span>
              </span>
              <Button variant="danger" onClick={() => removeHod(hod)} disabled={isSaving && actingOn === hod.id}>
                {isSaving && actingOn === hod.id ? "Removing..." : "Remove HOD"}
              </Button>
            </div>
          ) : (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              This department currently has no Head of Department.
            </p>
          )}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {members
              .filter((m) => m.id !== hod?.id)
              .map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
                >
                  <span>
                    {m.full_name} <span className="text-gray-400">({m.username})</span>
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => makeHod(m)}
                    disabled={!!hod || (isSaving && actingOn === m.id)}
                  >
                    {isSaving && actingOn === m.id ? "Assigning..." : "Make HOD"}
                  </Button>
                </li>
              ))}
          </ul>
        </>
      )}
      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
