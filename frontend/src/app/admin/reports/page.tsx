"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useGetLeaveTypesQuery } from "@/features/leave/catalogApi";
import { useAppSelector } from "@/store/hooks";
import { selectAccessToken } from "@/store/slices/authSlice";

// GET /api/reports/leave-applications/?format=csv|xlsx&... (HR_ADMIN,
// AUTHORIZING_OFFICER, SYSTEM_ADMIN only — see /API.md "Reports / exports").
// Filters: start_date (>=), end_date (last_date <=), department, station,
// leave_type, status, employee. Kept defensive (404/403 handling) in case
// this page is reached before a backend deploy catches up with API.md.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const REPORT_ENDPOINT = "reports/leave-applications/";

export default function AdminReportsPage() {
  const token = useAppSelector(selectAccessToken);
  const { data: leaveTypes } = useGetLeaveTypesQuery();

  const [status, setStatus] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ format });
      if (status) params.set("status", status);
      if (leaveType) params.set("leave_type", leaveType);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const res = await fetch(`${API_BASE_URL}/api/${REPORT_ENDPOINT}?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.status === 404) {
        setError("The reporting/export endpoint isn't available on the backend yet. Check back once API.md documents it.");
        return;
      }
      if (res.status === 403) {
        setError("You don't have permission to run reports (HR_ADMIN, AUTHORIZING_OFFICER, or SYSTEM_ADMIN only).");
        return;
      }
      if (!res.ok) {
        setError(`Report request failed (${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leave-applications-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the reporting endpoint.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Reports</h1>
      <Card>
        <p className="mb-4 text-sm text-gray-500">
          Filter and download leave application data. If the backend&apos;s reporting endpoint isn&apos;t
          deployed yet, this will say so instead of failing silently.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="APPROVED">Approved</option>
              <option value="DENIED">Denied</option>
              <option value="PENDING_HOD_REVIEW">Pending HOD</option>
              <option value="PENDING_HR_REVIEW">Pending HR</option>
              <option value="PENDING_AUTHORIZATION">Pending Authorization</option>
            </select>
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
            <Label htmlFor="startDate">From</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="endDate">To</Label>
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? "Preparing..." : "Download report"}
        </Button>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Card>
    </AppShell>
  );
}
