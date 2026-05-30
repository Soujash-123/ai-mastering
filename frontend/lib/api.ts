const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

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
};

export async function createJob(file: File, targetPlatform: string, userIntent: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target_platform", targetPlatform);
  fd.append("user_intent", userIntent);
  const res = await fetch(apiUrl("/api/jobs"), { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { job_id: string };
}

export async function fetchStatus(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/status`), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobStatus;
}

export async function fetchResult(jobId: string) {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/result`), { cache: "no-store" });
  if (res.status === 409) return null;
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as JobResult;
}
