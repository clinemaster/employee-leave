"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCreateUserMutation, useGetUsersQuery, useUpdateUserMutation } from "@/features/users/usersApi";
import {
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
  useGetDivisionsQuery,
  useGetSectionsQuery,
  useGetSupportDivisionsQuery,
  useGetUnitsQuery,
  useGetWorkStationsQuery,
} from "@/features/departments/orgApi";
import { extractErrorMessage } from "@/lib/api/errors";
import type { Role, User } from "@/types";

const PAGE_SIZE = 25;

// Roles exempt from the "belongs to exactly one org unit" rule (mirrors
// apps.accounts.models.ORG_UNIT_EXEMPT_ROLES on the backend) — organization-
// wide roles that aren't tied to a single department/division/support division.
const ORG_UNIT_EXEMPT_ROLES: Role[] = ["SYSTEM_ADMIN", "HR_ADMIN", "AUTHORIZING_OFFICER"];

type OrgUnitType = "department" | "division" | "support_division";

// Also doubles as the priority order used to pick the base `role` out of a
// set of checked roles (see splitRoles) — earlier wins.
const roles: Role[] = [
  "EMPLOYEE",
  "HEAD_OF_DEPARTMENT",
  "HEAD_OF_DIVISION",
  "HEAD_OF_SUPPORT_DIVISION",
  "HEAD_OF_SECTION",
  "HEAD_OF_UNIT",
  "HR_ADMIN",
  "AUTHORIZING_OFFICER",
  "SYSTEM_ADMIN",
];

// A user's roles are one `role` (base) plus zero or more `additional_roles`
// on the backend, but the UI presents them as a single checked set — this is
// the only place that splits/recombines them, so there's exactly one role
// assignment action instead of two separate pickers.
function splitRoles(selected: Role[]): { role: Role; additional_roles: Role[] } {
  const base = roles.find((r) => selected.includes(r)) ?? "EMPLOYEE";
  return { role: base, additional_roles: selected.filter((r) => r !== base) };
}

function combinedRoles(role: Role, additionalRoles: Role[]): Role[] {
  return [role, ...additionalRoles.filter((r) => r !== role)];
}

// Basic admin CRUD (list + create/edit) against /api/users/ (SYSTEM_ADMIN
// write). Roles/Active are inline actions; full profile editing opens a modal.
export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetUsersQuery({ page });
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [orgUnitType, setOrgUnitType] = useState<OrgUnitType>("department");
  const [orgUnitId, setOrgUnitId] = useState("");

  const { data: departments } = useGetDepartmentsQuery();
  const { data: divisions } = useGetDivisionsQuery();
  const { data: supportDivisions } = useGetSupportDivisionsQuery();

  const [editingUser, setEditingUser] = useState<User | null>(null);

  // New users are always created as EMPLOYEE; other roles are assigned
  // afterward via the "Roles" column/popover in the table below.
  const needsOrgUnit = !ORG_UNIT_EXEMPT_ROLES.includes("EMPLOYEE");
  const orgUnitOptions =
    orgUnitType === "department" ? departments : orgUnitType === "division" ? divisions : supportDivisions;

  async function handleCreate() {
    if (!username.trim() || !fullName.trim() || !checkNumber.trim()) return;
    if (needsOrgUnit && !orgUnitId) return;
    setCreateError(null);
    try {
      await createUser({
        username,
        full_name: fullName,
        check_number: checkNumber,
        email,
        role: "EMPLOYEE",
        password: password || undefined,
        ...(needsOrgUnit ? { [orgUnitType]: Number(orgUnitId) } : {}),
      }).unwrap();
      setUsername("");
      setFullName("");
      setCheckNumber("");
      setEmail("");
      setPassword("");
      setOrgUnitType("department");
      setOrgUnitId("");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create user. Please try again."));
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Manage Users</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Add User</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="checkNumber">Check number</Label>
            <Input id="checkNumber" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Temp password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {needsOrgUnit ? (
            <>
              <div>
                <Label htmlFor="orgUnitType">Belongs to</Label>
                <select
                  id="orgUnitType"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={orgUnitType}
                  onChange={(e) => {
                    setOrgUnitType(e.target.value as OrgUnitType);
                    setOrgUnitId("");
                  }}
                >
                  <option value="department">Department</option>
                  <option value="division">Division</option>
                  <option value="support_division">Support Division</option>
                </select>
              </div>
              <div>
                <Label htmlFor="orgUnit">
                  {orgUnitType === "department"
                    ? "Department"
                    : orgUnitType === "division"
                      ? "Division"
                      : "Support Division"}
                </Label>
                <select
                  id="orgUnit"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={orgUnitId}
                  onChange={(e) => setOrgUnitId(e.target.value)}
                >
                  <option value="">Select...</option>
                  {orgUnitOptions?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>
        {createError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError}
          </p>
        ) : null}
        <Button
          className="mt-3"
          onClick={handleCreate}
          disabled={isCreating || (needsOrgUnit && !orgUnitId)}
        >
          Add User
        </Button>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">S/No</th>
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Full name</th>
                  <th className="py-2 pr-4">Roles</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.results.map((u, index) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-4">{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="py-2 pr-4">{u.username}</td>
                    <td className="py-2 pr-4">{u.full_name}</td>
                    <td className="py-2 pr-4">
                      <RolesCell
                        user={u}
                        onChange={(role, additional_roles) => updateUser({ id: u.id, role, additional_roles })}
                      />
                    </td>
                    <td className="py-2 pr-4">{u.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setEditingUser(u)}>
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => updateUser({ id: u.id, is_active: !u.is_active })}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {editingUser ? (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} />
      ) : null}
    </AppShell>
  );
}

function RolesCell({
  user,
  onChange,
}: {
  user: User;
  onChange: (role: Role, additionalRoles: Role[]) => void;
}) {
  const current = combinedRoles(user.role, user.additional_roles ?? []);

  return (
    <details className="relative">
      <summary className="cursor-pointer text-gray-700">
        {current.map((r) => r.replaceAll("_", " ")).join(", ")}
      </summary>
      <div className="absolute z-10 mt-1 flex w-56 flex-col gap-1 rounded-md border border-gray-200 bg-white p-2 shadow-md">
        {roles.map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={current.includes(r)}
              onChange={(e) => {
                const next = e.target.checked ? [...current, r] : current.filter((x) => x !== r);
                const { role, additional_roles } = splitRoles(next);
                onChange(role, additional_roles);
              }}
            />
            {r.replaceAll("_", " ")}
          </label>
        ))}
      </div>
    </details>
  );
}

function initialOrgUnitType(user: User): OrgUnitType {
  if (user.division) return "division";
  if (user.support_division) return "support_division";
  return "department";
}

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [updateUser, { isLoading: isSaving }] = useUpdateUserMutation();
  const { data: departments } = useGetDepartmentsQuery();
  const { data: divisions } = useGetDivisionsQuery();
  const { data: supportDivisions } = useGetSupportDivisionsQuery();
  const { data: designations } = useGetDesignationsQuery();
  const { data: workStations } = useGetWorkStationsQuery();
  const { data: sections } = useGetSectionsQuery();
  const { data: units } = useGetUnitsQuery();

  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name);
  const [checkNumber, setCheckNumber] = useState(user.check_number ?? "");
  const [email, setEmail] = useState(user.email);
  const [officialEmail, setOfficialEmail] = useState(user.official_email ?? "");
  const [personnelFileNumber, setPersonnelFileNumber] = useState(user.personnel_file_number ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number ?? "");
  const [designation, setDesignation] = useState(user.designation != null ? String(user.designation) : "");
  const [workStation, setWorkStation] = useState(user.work_station != null ? String(user.work_station) : "");
  const [section, setSection] = useState(user.section != null ? String(user.section) : "");
  const [unit, setUnit] = useState(user.unit != null ? String(user.unit) : "");
  const [orgUnitType, setOrgUnitType] = useState<OrgUnitType>(initialOrgUnitType(user));
  const [orgUnitId, setOrgUnitId] = useState(
    String(user.department ?? user.division ?? user.support_division ?? "")
  );
  const [error, setError] = useState<string | null>(null);

  const needsOrgUnit = !ORG_UNIT_EXEMPT_ROLES.includes(user.role);
  const orgUnitOptions =
    orgUnitType === "department" ? departments : orgUnitType === "division" ? divisions : supportDivisions;

  async function handleSave() {
    if (!username.trim() || !fullName.trim() || !checkNumber.trim()) return;
    if (needsOrgUnit && !orgUnitId) return;
    setError(null);
    try {
      await updateUser({
        id: user.id,
        username,
        full_name: fullName,
        check_number: checkNumber,
        email,
        official_email: officialEmail,
        personnel_file_number: personnelFileNumber,
        phone_number: phoneNumber,
        designation: designation ? Number(designation) : null,
        work_station: workStation ? Number(workStation) : null,
        section: section ? Number(section) : null,
        unit: unit ? Number(unit) : null,
        department: null,
        division: null,
        support_division: null,
        ...(needsOrgUnit ? { [orgUnitType]: Number(orgUnitId) } : {}),
      }).unwrap();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save changes. Please try again."));
    }
  }

  return (
    <Modal title={`Edit User — ${user.username}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-username">Username</Label>
          <Input id="edit-username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-fullName">Full name</Label>
          <Input id="edit-fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-checkNumber">Check number</Label>
          <Input id="edit-checkNumber" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-email">Email</Label>
          <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-officialEmail">Official email</Label>
          <Input
            id="edit-officialEmail"
            type="email"
            value={officialEmail}
            onChange={(e) => setOfficialEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="edit-personnelFile">Personnel file number</Label>
          <Input
            id="edit-personnelFile"
            value={personnelFileNumber}
            onChange={(e) => setPersonnelFileNumber(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="edit-phone">Phone number</Label>
          <Input id="edit-phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-designation">Designation</Label>
          <select
            id="edit-designation"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          >
            <option value="">None</option>
            {designations?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="edit-workStation">Work station</Label>
          <select
            id="edit-workStation"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={workStation}
            onChange={(e) => setWorkStation(e.target.value)}
          >
            <option value="">None</option>
            {workStations?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="edit-section">Section</Label>
          <select
            id="edit-section"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">None</option>
            {sections?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="edit-unit">Unit</Label>
          <select
            id="edit-unit"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">None</option>
            {units?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {needsOrgUnit ? (
          <>
            <div>
              <Label htmlFor="edit-orgUnitType">Belongs to</Label>
              <select
                id="edit-orgUnitType"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={orgUnitType}
                onChange={(e) => {
                  setOrgUnitType(e.target.value as OrgUnitType);
                  setOrgUnitId("");
                }}
              >
                <option value="department">Department</option>
                <option value="division">Division</option>
                <option value="support_division">Support Division</option>
              </select>
            </div>
            <div>
              <Label htmlFor="edit-orgUnit">
                {orgUnitType === "department"
                  ? "Department"
                  : orgUnitType === "division"
                    ? "Division"
                    : "Support Division"}
              </Label>
              <select
                id="edit-orgUnit"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={orgUnitId}
                onChange={(e) => setOrgUnitId(e.target.value)}
              >
                <option value="">Select...</option>
                {orgUnitOptions?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || (needsOrgUnit && !orgUnitId)}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
