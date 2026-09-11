import { RefObject } from "react";
import { UserTier, TierConfig } from "@/lib/tier";

export interface UploadProps {
  dragOver: boolean;
  setDragOver: (val: boolean) => void;
  busy: boolean;
  progress: number;
  error: string | null;
  setError: (val: string | null) => void;
  platform: string;
  setPlatform: (val: string) => void;
  intentValue: string;
  setIntentValue: (val: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (val: boolean | ((v: boolean) => boolean)) => void;
  selectedFile: File | null;
  setSelectedFile: (val: File | null) => void;
  fileDuration: number | null;
  setFileDuration: (val: number | null) => void;
  tier: UserTier;
  showTierModal: boolean;
  setShowTierModal: (val: boolean) => void;
  tierCfg: TierConfig;
  handleTierSelect: (t: UserTier) => void;
  onFiles: (files: FileList | null) => void;
  handleMaster: () => void;
  inputRef: RefObject<HTMLInputElement>;
  fmt: (b: number) => string;
  fmtDur: (s: number) => string;
  isDurationExceeded: boolean;
  PLATFORMS: { value: string; label: string }[];
  CREATIVE_INTENTS: { value: string; label: string }[];
}
