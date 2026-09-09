"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/slices/authSlice";
import { saveTokens } from "@/lib/auth/tokenStorage";
import { useLoginMutation } from "@/features/auth/authApi";
import { roleHomeRoute } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await login({ email, password }).unwrap();
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
    } catch {
      // error state surfaced via `error` below
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">NAOT Leave Management</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
    </main>
  );
}
