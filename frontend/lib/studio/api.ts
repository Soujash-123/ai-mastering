import { apiUrl } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import type { StudioData, StudioSession } from "./types";

async function err(res: Response): Promise<Error> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { detail?: string };
    if (typeof json.detail === "string") return new Error(json.detail);
  } catch {
    /* ignore */
  }
  return new Error(text || res.statusText);
}

const base = (jobId: string) => apiUrl(`/api/jobs/${jobId}/studio`);
const jsonHeaders = () => ({ "Content-Type": "application/json", ...authHeaders() });

export async function fetchStudio(jobId: string): Promise<StudioData> {
  const res = await fetch(base(jobId), { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw await err(res);
  return (await res.json()) as StudioData;
}

export async function saveStudioSession(jobId: string, session: StudioSession): Promise<StudioSession> {
  const res = await fetch(`${base(jobId)}/session`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ session }),
  });
  if (!res.ok) throw await err(res);
  return ((await res.json()) as { session: StudioSession }).session;
}

export type AgentResponse = {
  reply: string;
  session: StudioSession;
  changes: string[];
  proposals: { overrides: Record<string, number>; reason: string }[];
};

export async function askCopilot(
  jobId: string,
  body: {
    messages: { role: "user" | "assistant"; content: string }[];
    session: StudioSession;
    playhead_sec: number;
    selection: { start_sec: number; end_sec: number } | null;
  },
): Promise<AgentResponse> {
  const res = await fetch(`${base(jobId)}/agent`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await err(res);
  return (await res.json()) as AgentResponse;
}

export async function commitStudio(jobId: string, session: StudioSession): Promise<void> {
  const res = await fetch(`${base(jobId)}/commit`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ session }),
  });
  if (!res.ok) throw await err(res);
}

export async function revertStudio(jobId: string): Promise<void> {
  const res = await fetch(`${base(jobId)}/revert`, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw await err(res);
}

export type StudioStatus = { finalizing: boolean; finalize_error: string | null; committed: boolean };

export async function fetchStudioStatus(jobId: string): Promise<StudioStatus> {
  const res = await fetch(`${base(jobId)}/status`, { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw await err(res);
  return (await res.json()) as StudioStatus;
}

/** Poll until a background commit/revert/finalize finishes. */
export async function waitForRender(jobId: string, timeoutMs = 10 * 60_000): Promise<StudioStatus> {
  const start = Date.now();
  for (;;) {
    const s = await fetchStudioStatus(jobId);
    if (!s.finalizing) return s;
    if (Date.now() - start > timeoutMs) throw new Error("Rendering is taking too long. Check back shortly.");
    await new Promise((r) => setTimeout(r, 1500));
  }
}
