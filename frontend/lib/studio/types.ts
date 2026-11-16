export type ParamSpec = {
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: string;
  hint?: string;
};

export type ModuleSpec = {
  label: string;
  default_enabled: boolean;
  params: Record<string, ParamSpec>;
};

export type StudioSpec = {
  modules: Record<string, ModuleSpec>;
  region: Record<string, ParamSpec>;
  presets: Record<string, { label: string; modules: Record<string, Record<string, number | boolean>> }>;
  constants: Record<string, number>;
  max_regions: number;
};

export type ModuleState = { enabled: boolean } & Record<string, number | boolean>;

export type Region = {
  id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  gain_db: number;
  bass_db: number;
  air_db: number;
  fade_ms: number;
};

export type StudioSession = {
  version: number;
  preset: string;
  modules: Record<string, ModuleState>;
  regions: Region[];
  committed: boolean;
};

export type StudioData = {
  job_id: string;
  title: string;
  session: StudioSession;
  spec: StudioSpec;
  base_url: string;
  original_url: string;
  duration_sec: number;
  sample_rate: number;
  base_lufs: number | null;
  original_lufs: number | null;
  peaks: number[];
  sections: { section: string; start_sec: number; end_sec: number }[];
  style: { family: string; label: string };
  committed: boolean;
  finalizing: boolean;
  finalize_error: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  changes?: string[];
  proposals?: { overrides: Record<string, number>; reason: string }[];
  error?: boolean;
};

export type ListenMode = "edit" | "ai" | "original";
