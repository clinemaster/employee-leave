"use client";

import { useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { useAppSelector } from "@/store/hooks";
import { selectCurrentUser } from "@/features/auth/selectors";
import {
  useMeQuery,
  useMfaSetupMutation,
  useMfaVerifySetupMutation,
  useMfaDisableMutation,
} from "@/features/auth/authApi";

// Self-service MFA (TOTP) enable/disable — see /API.md "Auth" and
// SECURITY.md. Any authenticated role may opt in; nothing here is
// role-gated (RoleGuard has no /settings rule in routeRoleMap, so every
// authenticated role reaches this page).
export default function SettingsPage() {
  const sessionUser = useAppSelector(selectCurrentUser);
  const { data: user, isLoading: isLoadingUser } = useMeQuery();
  const currentUser = user ?? sessionUser;

  const [mfaSetup, { isLoading: isStartingSetup }] = useMfaSetupMutation();
  const [mfaVerifySetup, { isLoading: isVerifying }] = useMfaVerifySetupMutation();
  const [mfaDisable, { isLoading: isDisabling }] = useMfaDisableMutation();

  const [provisioning, setProvisioning] = useState<{ secret: string; provisioning_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDisableForm, setShowDisableForm] = useState(false);

  async function handleStartSetup() {
    setError(null);
    setMessage(null);
    try {
      const result = await mfaSetup().unwrap();
      setProvisioning(result);
    } catch {
      setError("Could not start MFA setup. Please try again.");
    }
  }

  async function handleConfirmSetup() {
    setError(null);
    if (!code.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    try {
      await mfaVerifySetup({ code }).unwrap();
      setProvisioning(null);
      setCode("");
      setMessage("Two-factor authentication is now enabled on your account.");
    } catch {
      setError("Invalid code. Please check your authenticator app and try again.");
    }
  }

  function cancelSetup() {
    setProvisioning(null);
    setCode("");
    setError(null);
  }

  async function handleDisable() {
    setError(null);
    if (!password.trim()) {
      setError("Enter your password to disable two-factor authentication.");
      return;
    }
    try {
      await mfaDisable({ password }).unwrap();
      setShowDisableForm(false);
      setPassword("");
      setMessage("Two-factor authentication has been disabled.");
    } catch {
      setError("Incorrect password.");
    }
  }

  const mfaEnabled = Boolean(currentUser?.mfa_enabled);

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Account Settings</h1>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Two-Factor Authentication (MFA)</h2>
        <p className="mb-4 text-sm text-gray-500">
          Add an extra layer of security using a TOTP authenticator app (Google Authenticator, Authy,
          1Password, etc.). Optional for every role, strongly recommended for HR Admin, Authorizing
          Officer, and System Admin accounts.
        </p>

        {isLoadingUser ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : mfaEnabled && !showDisableForm ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-green-700">Two-factor authentication is enabled.</p>
            <Button variant="danger" onClick={() => setShowDisableForm(true)}>
              Disable MFA
            </Button>
          </div>
        ) : mfaEnabled && showDisableForm ? (
          <div className="max-w-sm space-y-3">
            <div>
              <Label htmlFor="disable-password">Confirm your password to disable MFA</Label>
              <Input
                id="disable-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDisable} disabled={isDisabling}>
                {isDisabling ? "Disabling..." : "Confirm Disable"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDisableForm(false);
                  setPassword("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : provisioning ? (
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-gray-700">
              Scan this with your authenticator app, or enter the secret manually, then confirm with a
              code below.
            </p>
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Manual entry secret</p>
              <p className="break-all font-mono text-sm text-gray-900">{provisioning.secret}</p>
            </div>
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Provisioning URI</p>
              <p className="break-all font-mono text-xs text-gray-700">{provisioning.provisioning_uri}</p>
            </div>
            <div>
              <Label htmlFor="setup-code">Confirmation Code</Label>
              <Input
                id="setup-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmSetup} disabled={isVerifying}>
                {isVerifying ? "Confirming..." : "Confirm & Enable"}
              </Button>
              <Button variant="secondary" onClick={cancelSetup}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Two-factor authentication is not enabled.</p>
            <Button onClick={handleStartSetup} disabled={isStartingSetup}>
              {isStartingSetup ? "Starting..." : "Enable MFA"}
            </Button>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
      </Card>
    </AppShell>
  );
}
