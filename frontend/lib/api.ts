import { authHeaders } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
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

export type JobStatus = {
  job_id: string;
  status: string;
  progress: number;
  message: string;
  updated_at: string;
};

export type MemoryStepReport = {
  name: string;
  rss_start_mb: number;
  rss_end_mb: number;
  rss_peak_mb: number;
  delta_mb: number;
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
  memory_profile?: MemoryStepReport[];
};

export async function createJob(file: File, targetPlatform: string, userIntent: string, ephemeral = true) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target_platform", targetPlatform);
  fd.append("user_intent", userIntent);
  fd.append("ephemeral", String(ephemeral));
  const res = await fetch(apiUrl("/api/jobs"), {
    method: "POST",
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as { job_id: string };
}

export async function fetchStatus(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/status`), { cache: "no-store" });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as JobStatus;
}

export async function fetchResult(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/result`), {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 409) return null;
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as JobResult;
}

export function wsUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE || "";
  if (base) return base.replace(/^http/, "ws") + path;
  if (typeof window === "undefined") return path;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export async function deleteJob(jobId: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/jobs/${jobId}`), { method: "DELETE", headers: authHeaders(), keepalive: true });
  } catch {
    /* best-effort */
  }
}
