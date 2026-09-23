"use client";

import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Input";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import { orgUnitName, REGIONS } from "@/types";

// Read-only view of the applicant details that used to be Step 1 ("Personal
// Info") of the leave application wizard — moved to its own sidebar page so
// the wizard now starts at "Leave Request". Same fields, same source (the
// user's profile), still read-only: the applicant is not expected to edit
// these here (see LeaveApplicationForm's sectionAPayload, which still pulls
// them from the profile independently of this page).
export default function PersonalInformationPage() {
  const user = useAppSelector(selectCurrentUser);
  const placeOfDomicile = REGIONS.find((r) => r.code === user?.place_of_domicile)?.label ?? null;

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Personal Information</h1>
      <Card>
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Pre-filled from your profile — read only.</p>
          <div className="grid grid-cols-2 gap-4">
            <ReadOnlyField label="Full Name" value={user?.full_name} />
            <ReadOnlyField label="Check Number" value={user?.check_number} />
            <ReadOnlyField label="Personnel File Number" value={user?.personnel_file_number} />
            <ReadOnlyField label="Place of Domicile" value={placeOfDomicile} />
            <ReadOnlyField label="Department" value={orgUnitName(user)} />
            <ReadOnlyField label="Work Station" value={user?.work_station_name} />
            <ReadOnlyField label="Designation" value={user?.designation_name} />
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{value || "-"}</p>
    </div>
  );
}
