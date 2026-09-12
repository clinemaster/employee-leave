"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/slices/authSlice";
import { saveTokens } from "@/lib/auth/tokenStorage";
import { useLoginMutation, useMfaLoginVerifyMutation, isMfaChallenge } from "@/features/auth/authApi";
import { roleHomeRoute } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";

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
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <LoginShell>
      {mfaToken ? (
        <>
          <TitleBlock />
          <p className="mb-6 text-sm text-gray-500">Enter the 6-digit code from your authenticator app.</p>
          <form onSubmit={handleMfaSubmit} className="space-y-5">
            <div>
              <Label htmlFor="mfa-code" className="sr-only">
                Authentication Code
              </Label>
              <IconInput
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Authentication Code *"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                icon={<ShieldIcon />}
              />
            </div>
            {mfaError ? (
              <p className="text-sm text-red-600">Invalid or expired code. Please try again.</p>
            ) : null}
            <Button type="submit" className="w-full tracking-wide" disabled={isVerifying}>
              {isVerifying ? "VERIFYING…" : "VERIFY"}
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
        </>
      ) : (
        <>
          <TitleBlock />
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username" className="sr-only">
                Username
              </Label>
              <IconInput
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Username *"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                icon={<MailIcon />}
              />
            </div>
            <div>
              <Label htmlFor="password" className="sr-only">
                Password
              </Label>
              <IconInput
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password *"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon={<EyeIcon open={showPassword} />}
                onIconClick={() => setShowPassword((v) => !v)}
                iconLabel={showPassword ? "Hide password" : "Show password"}
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600">Login failed. Please check your credentials.</p>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isLoading} className="px-10 tracking-wide">
                {isLoading ? "SIGNING IN…" : "LOGIN"}
              </Button>
            </div>
          </form>
        </>
      )}
    </LoginShell>
  );
}

function TitleBlock() {
  return (
    <div className="mb-8 text-center md:text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/naot-badge.png" alt="NAOT" className="mx-auto mb-4 h-20 w-20 object-contain md:mx-0" />
      <p className="text-lg text-gray-600">The United Republic of Tanzania</p>
      <p className="text-lg font-semibold text-gray-800">National Audit Office</p>
      <p className="text-2xl font-bold text-gray-900">Leave Management System</p>
    </div>
  );
}

const CAROUSEL_SLIDES = [
  "/login-carousel/slide-1.jpg",
  "/login-carousel/slide-2.jpg",
  "/login-carousel/slide-3.jpg",
  "/login-carousel/slide-4.jpg",
  "/login-carousel/slide-5.jpg",
];
const CAROUSEL_INTERVAL_MS = 4500;

function LoginCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % CAROUSEL_SLIDES.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-900">
      {CAROUSEL_SLIDES.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden={i !== index}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
        {CAROUSEL_SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-2 w-2 rounded-full transition-colors ${
              i === index ? "bg-white" : "bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Shared shell for both the credentials and MFA-challenge screens: a large
// rounded split card (rotating photo carousel on the left, sign-in content
// on the right) floating over a blurred, darkened backdrop built from the
// same photos.
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-900 px-4 py-10">
      <div aria-hidden="true" className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-carousel/slide-2.jpg"
          alt=""
          className="h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
        <div className="absolute inset-0 bg-gray-900/60" />
      </div>

      <div className="relative z-10 flex w-full max-w-5xl min-h-[600px] overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="hidden md:block md:w-1/2">
          <LoginCarousel />
        </div>
        <div className="flex w-full flex-col justify-center px-8 py-10 sm:px-12 md:w-1/2">{children}</div>
      </div>
    </main>
  );
}

// A text input with a leading or trailing icon (mail/shield glyph, or a
// clickable show/hide-password toggle), styled to resemble the reference
// design's pill-shaped fields rather than this app's default boxy Input.
function IconInput({
  icon,
  onIconClick,
  iconLabel,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ReactNode;
  onIconClick?: () => void;
  iconLabel?: string;
}) {
  return (
    <div className="relative">
      <input
        className={`w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 ${className ?? ""}`}
        {...props}
      />
      {onIconClick ? (
        <button
          type="button"
          onClick={onIconClick}
          aria-label={iconLabel}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {icon}
        </button>
      ) : (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
      )}
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12s3.5-7 9-7c1.7 0 3.2.5 4.5 1.3M21 12s-3.5 7-9 7c-1.7 0-3.2-.5-4.5-1.3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
