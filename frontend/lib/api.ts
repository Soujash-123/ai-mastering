import { authHeaders, getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export type JobStatus = {
  job_id: string;
  status: string;
  progress: number;
  message: string;
  updated_at: string;
};

export type JobResult = {
  job_id: string;
  status: string;
  analysis: Record<string, unknown>;
  raw_intent: Record<string, unknown> | null;
  safe_intent: Record<string, unknown> | null;
  report: {
    analysis_summary?: string;
    emotional_summary?: string;
    mix_strengths?: string[];
    mix_issues?: string[];
    mastering_focus_points?: string[];
    translation_notes?: string[];
    spatial_notes?: string[];
    harmonic_notes?: string[];
    commercial_readiness_assessment?: string;
    final_mastering_outlook?: string;
    mix_assessment?: string;
    mastering_direction?: string;
    commercial_readiness?: string;
    translation_assessment?: string;
    dynamic_assessment?: string;
    spatial_assessment?: string;
    emotional_assessment?: string;
    final_summary?: string;
    bullets?: string[];
  };
  input_url: string;
  master_wav_url: string;
  exports: { profile: string; format: string; path: string; download_url: string }[];
  streaming_notes: string[];
  streaming_previews?: {
    label: string;
    description: string;
    filename: string;
    category: string;
    preview_url: string;
  }[];
  duration_sec?: number;
  eta_seconds?: number;
};

export async function createJob(file: File, targetPlatform: string, userIntent: string, ephemeral = true) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target_platform", targetPlatform);
  fd.append("user_intent", userIntent);
  fd.append("ephemeral", String(ephemeral));
  const res = await fetch(apiUrl("/api/jobs"), { method: "POST", headers: authHeaders(), body: fd });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { job_id: string };
}

export async function fetchStatus(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/status`), { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobStatus;
}

export async function fetchResult(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/result`), { headers: authHeaders(), cache: "no-store" });
  if (res.status === 409) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobResult;
}

export function wsUrl(path: string): string {
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const base = process.env.NEXT_PUBLIC_API_BASE || "";
  if (base) return base.replace(/^http/, "ws") + path + qs;
  if (typeof window === "undefined") return path + qs;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}${qs}`;
}

export async function deleteJob(jobId: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/jobs/${jobId}`), { method: "DELETE", headers: authHeaders(), keepalive: true });
  } catch {
    /* best-effort */
  }
}
