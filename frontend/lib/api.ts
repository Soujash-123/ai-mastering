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

/**
 * Cloud presence of the final master (Appwrite storage).
 *
 * `state`:
 *  - `none`     Appwrite is not configured, or the job predates the integration
 *  - `uploaded` stored in the bucket; `download_url` is a signed Appwrite URL
 *  - `failed`   mastering succeeded but the cloud upload did not
 *  - `expired`  the retention window closed and the file was deleted
 */
export type MasterInfo = {
  filename: string;
  file_id: string | null;
  expires_at: string | null;
  /** Absolute Appwrite URL when a file token was minted, else null. */
  download_url: string | null;
  state: "none" | "uploaded" | "failed" | "expired";
  error: string | null;
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
  master_playback_url?: string;
  waveform_peaks?: number[];
  exports: { profile: string; format: string; path: string; download_url: string }[];
  streaming_notes: string[];
  memory_profile?: MemoryStepReport[];
  dsp_params?: Record<string, number> | null;
  master?: MasterInfo | null;
  finalizing?: boolean;
  finalize_error?: string | null;
};

/**
 * Resolve the best available canonical-master download URL.
 *
 * Uses the application download route so the browser receives a download
 * without navigating to or exposing the Appwrite media URL.
 *
 * `cacheBust` is appended only to the backend path: a signed Appwrite URL
 * already carries a `?token=...` query, and a second `?` would corrupt it.
 * Signed URLs are unique per upload, so they need no cache-busting.
 */
export function masterDownloadUrl(
  data: Pick<JobResult, "job_id" | "master" | "master_wav_url">,
  cacheBust?: number,
): string {
  const base = apiUrl(`/api/jobs/${data.job_id}/master/download`);
  return cacheBust === undefined ? base : `${base}?v=${cacheBust}`;
}

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

export type PreviewResponse = {
  url: string;
  download_url?: string;
  params: Record<string, number>;
  lufs: number | null;
  peak_db: number | null;
  duration_sec: number;
  is_full: boolean;
  segment_start_sec: number | null;
};

export type PreviewRequest = {
  overrides: Record<string, number>;
  segment_sec?: number;
  window_start_sec?: number | null;
};

export async function previewJob(jobId: string, req: PreviewRequest) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/preview`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as PreviewResponse;
}

export async function finalizeJob(jobId: string, overrides: Record<string, number>) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/finalize`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ overrides }),
  });
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
