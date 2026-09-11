"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useCreateUserMutation, useGetUsersQuery, useUpdateUserMutation } from "@/features/users/usersApi";
import { extractErrorMessage } from "@/lib/api/errors";
import type { Role } from "@/types";

const roles: Role[] = [
  "EMPLOYEE",
  "HEAD_OF_DEPARTMENT",
  "HEAD_OF_SECTION",
  "HEAD_OF_UNIT",
  "HR_ADMIN",
  "AUTHORIZING_OFFICER",
  "SYSTEM_ADMIN",
];

// Basic admin CRUD (list + create/edit) against /api/users/ (SYSTEM_ADMIN
// write). Edit is inline (role + active toggle) — full profile editing is
// left to a later phase.
export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetUsersQuery({ page });
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate() {
    if (!username.trim() || !fullName.trim() || !checkNumber.trim()) return;
    setCreateError(null);
    try {
      await createUser({
        username,
        full_name: fullName,
        check_number: checkNumber,
        email,
        role,
        password: password || undefined,
      }).unwrap();
      setUsername("");
      setFullName("");
      setCheckNumber("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to create user. Please try again."));
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

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
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="password">Temp password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        {createError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError}
          </p>
        ) : null}
        <Button className="mt-3" onClick={handleCreate} disabled={isCreating}>
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
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Full name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.results.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-4">{u.username}</td>
                    <td className="py-2 pr-4">{u.full_name}</td>
                    <td className="py-2 pr-4">
                      <select
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                        value={u.role}
                        onChange={(e) => updateUser({ id: u.id, role: e.target.value as Role })}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">{u.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 pr-4">
                      <Button
                        variant="secondary"
                        onClick={() => updateUser({ id: u.id, is_active: !u.is_active })}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </Button>
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
    </AppShell>
  );
}
