// Thin wrapper around localStorage for JWT persistence across reloads.
// NOTE: storing tokens in localStorage is convenient for phase 1 but is
// vulnerable to XSS; revisit httpOnly cookie storage in a later phase once
// the backend agent exposes a cookie-based auth flow if desired.
const ACCESS_KEY = "naot_access_token";
const REFRESH_KEY = "naot_refresh_token";

export function saveTokens(accessToken: string, refreshToken: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function loadTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null };
  return {
    accessToken: window.localStorage.getItem(ACCESS_KEY),
    refreshToken: window.localStorage.getItem(REFRESH_KEY),
  };
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}
