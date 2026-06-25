import { apiUrl } from "./api";

export type UserRole = "ADMIN" | "EARLY_ACCESS" | "ROLLOUT";

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

const TOKEN_KEY = "kord_access_token";
const TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function setTokenCookie(token: string): void {
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE_SEC}; SameSite=Lax`;
}

function clearTokenCookie(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  setTokenCookie(token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  clearTokenCookie();
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function roleBadgeLabel(role: UserRole): string {
  if (role === "ADMIN") return "Admin";
  if (role === "EARLY_ACCESS") return "Early Access";
  return "Rollout";
}

export function maxUploadDurationSec(role: UserRole): number {
  if (role === "ROLLOUT") return 120;
  return 300;
}

export function uploadLimitLabel(role: UserRole): string {
  if (role === "ROLLOUT") return "2 minutes";
  return "5 minutes";
}

export function canAccessAdvancedFeatures(role: UserRole): boolean {
  return role === "ADMIN" || role === "EARLY_ACCESS";
}

export function canAccessFullResult(role: UserRole): boolean {
  return canAccessAdvancedFeatures(role);
}

export function canAccessSimulations(role: UserRole): boolean {
  return canAccessFullResult(role);
}

export function durationLimitMessage(role: UserRole): string {
  if (role === "ROLLOUT") return "Rollout allows tracks up to 2 minutes.";
  if (role === "EARLY_ACCESS") return "Early Access allows tracks up to 5 minutes.";
  return "Admin uploads are limited to 5 minutes.";
}

export async function getAudioDurationSec(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio();
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Could not read audio duration")), { once: true });
    });
    return audio.duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function register(fullName: string, email: string, password: string): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName, email, password }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = (await res.json()) as { access_token: string };
  setToken(data.access_token);
  return fetchMe();
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = (await res.json()) as { access_token: string };
  setToken(data.access_token);
  return fetchMe();
}

export async function logout(): Promise<void> {
  try {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: authHeaders() });
  } catch {
    /* ignore */
  }
  clearToken();
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/me"), { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as AuthUser;
}

async function parseApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: string | { msg?: string }[] };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail)) return json.detail.map((d) => d.msg ?? "").join(", ") || text;
  } catch {
    /* fall through */
  }
  return text || res.statusText;
}

export async function submitEarlyAccessRequest(payload: {
  name: string;
  email: string;
  phone: string;
  reason: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/api/early-access/requests"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
}
