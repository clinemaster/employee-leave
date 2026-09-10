"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/slices/authSlice";
import { saveTokens } from "@/lib/auth/tokenStorage";
import { useLoginMutation, useMfaLoginVerifyMutation, isMfaChallenge } from "@/features/auth/authApi";
import { roleHomeRoute } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();
  const [mfaLoginVerify, { isLoading: isVerifying, error: mfaError }] = useMfaLoginVerifyMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function completeLogin(result: { access: string; refresh: string; user: import("@/types").User | null }) {
    saveTokens(result.access, result.refresh);
    dispatch(
      setCredentials({
        accessToken: result.access,
        refreshToken: result.refresh,
        user: result.user ?? null,
      })
    );
    const next = searchParams.get("next");
    router.push(next ?? (result.user ? roleHomeRoute[result.user.role] : "/dashboard"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await login({ username, password }).unwrap();
      if (isMfaChallenge(result)) {
        setMfaToken(result.mfa_token);
        return;
      }
      completeLogin(result);
    } catch {
      // error state surfaced via `error` below
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    try {
      const result = await mfaLoginVerify({ mfa_token: mfaToken, code }).unwrap();
      completeLogin(result);
    } catch {
      // error state surfaced via `mfaError` below
    }
  }

  if (mfaToken) {
    return (
      <LoginBackground>
        <Card className="w-full max-w-sm">
          <h1 className="mb-1 text-xl font-semibold text-gray-900">Two-Factor Verification</h1>
          <p className="mb-6 text-sm text-gray-500">
            Enter the 6-digit code from your authenticator app.
          </p>
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <Label htmlFor="mfa-code">Authentication Code</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
            </div>
            {mfaError ? (
              <p className="text-sm text-red-600">Invalid or expired code. Please try again.</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={isVerifying}>
              {isVerifying ? "Verifying..." : "Verify"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMfaToken(null);
                setCode("");
              }}
            >
              Back to sign in
            </Button>
          </form>
        </Card>
      </LoginBackground>
    );
  }

  return (
    <LoginBackground>
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">NAOT Leave Management</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600">Login failed. Please check your credentials.</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </LoginBackground>
  );
}

// Shared background for both the credentials and MFA-challenge screens: the
// NAOT logo rendered as a large, faint watermark filling the entire page.
function LoginBackground({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* Plain <img>, not next/image: a static watermark doesn't need
            responsive srcset/optimization, and this keeps it simple.
            object-contain (not cover) keeps the whole logo visible,
            uncropped, at just under full viewport size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/naot-logo.png"
          alt=""
          className="h-full w-full object-contain opacity-10"
        />
      </div>
      <div className="relative z-10 md:-translate-x-32">{children}</div>
    </main>
  );
}
