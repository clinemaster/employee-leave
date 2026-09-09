"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { TabbedApplications } from "@/components/dashboard/TabbedApplications";
import { Input, Label } from "@/components/ui/Input";
import { useGetLeaveTypesQuery } from "@/features/leave/catalogApi";

// Search/filter UI wired to query params against the leave-applications list
// endpoint (see leaveApi's LeaveApplicationListParams). Fields cover
// employee (free-text search), check number, personnel file, department,
// station, leave type, and date — matching the task's HR filter spec.
export default function HrApplicationsPage() {
  const [search, setSearch] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [personnelFile, setPersonnelFile] = useState("");
  const [department, setDepartment] = useState("");
  const [station, setStation] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [date, setDate] = useState("");

  const { data: leaveTypes } = useGetLeaveTypesQuery();

  const extraParams = useMemo(
    () => ({
      search: search || undefined,
      check_number: checkNumber || undefined,
      personnel_file: personnelFile || undefined,
      division_department: department || undefined,
      station: station || undefined,
      leave_type: leaveType ? Number(leaveType) : undefined,
      start_date: date || undefined,
    }),
    [search, checkNumber, personnelFile, department, station, leaveType, date]
  );

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">HR — Applications</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label htmlFor="search">Employee</Label>
          <Input id="search" placeholder="Name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="checkNumber">Check number</Label>
          <Input id="checkNumber" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="personnelFile">Personnel file</Label>
          <Input id="personnelFile" value={personnelFile} onChange={(e) => setPersonnelFile(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="station">Station</Label>
          <Input id="station" value={station} onChange={(e) => setStation(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="leaveType">Leave type</Label>
          <select
            id="leaveType"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
          >
            <option value="">All</option>
            {leaveTypes?.map((lt) => (
              <option key={lt.id} value={lt.id}>
                {lt.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="date">Start date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <TabbedApplications
        detailBasePath="/hr/applications"
        extraParams={extraParams}
        tabs={[
          { label: "Pending Verification", status: "PENDING_HR_REVIEW" },
          { label: "Verified", status: "HR_VERIFIED" },
          { label: "Returned", status: "RETURNED_TO_HOD" },
          { label: "Completed", status: "APPROVED" },
        ]}
      />
    </AppShell>
  );
}
