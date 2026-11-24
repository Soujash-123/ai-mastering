"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createJob } from "@/lib/api";
import { getTier, getTierConfig, setTier, type UserTier } from "@/lib/tier";
import { getAudioDurationSec } from "@/lib/auth";
import { UploadNeon } from "@/components/UploadNeon";
import { TierSwitchModal } from "@/components/TierSwitchModal";
import { useAuth } from "@/components/auth/AuthProvider";
import { canAccessCreativeDesk } from "@/lib/auth";
import { effectiveDesk, hasTweaks, tweakFor, type DeskKey, type DeskTweaks } from "@/lib/desk";

const PLATFORMS = [
  { value: "Spotify", label: "Streaming (Default)" },
  { value: "Apple Music", label: "Apple Music" },
  { value: "YouTube", label: "YouTube" },
  { value: "SoundCloud", label: "SoundCloud" },
  { value: "Club / PA", label: "Club / PA" },
  { value: "Broadcast", label: "Broadcast" },
];

const CREATIVE_INTENTS = [
  { value: "Preserve dynamics; improve translation.", label: "Balanced" },
  { value: "Maximize punch and impact while maintaining natural dynamics.", label: "Punchy" },
  { value: "Add warmth and body, smooth highs, preserve low-end depth.", label: "Warm" },
  { value: "Enhance clarity and air, forward presence, crisp transients.", label: "Bright" },
  { value: "Wide, spacious, emotional depth with gentle dynamic arc.", label: "Cinematic" },
  { value: "Competitive streaming loudness, maximize energy and presence.", label: "Loud" },
];

// Style envelopes enforced by the backend safety layer (mastering/style_profiles.py).
// Available to every tier.
const STYLE_FAMILIES = [
  { value: "auto", label: "Auto", hint: "General-purpose mastering" },
  { value: "indian_classical", label: "Classical", hint: "Hindustani / Carnatic — keeps dynamics, drone and tabla natural" },
  { value: "devotional", label: "Devotional", hint: "Bhajan / kirtan — warm, gentle, intimate" },
  { value: "film_melodic", label: "Film song", hint: "Playback / melodic — clear, smooth vocals" },
  { value: "bollywood_dance", label: "Bollywood / Dance", hint: "Punjabi / dance — loud, punchy dhol and bass" },
  { value: "fusion_indie", label: "Fusion / Indie", hint: "Indian instruments with modern production" },
];

const ACCEPTED_EXTS = ["wav", "flac", "aiff", "aif", "m4a", "aac", "mp3", "ogg", "opus"];

export default function UploadPage() {
  const router = useRouter();
  const [tier, setTierState] = useState<UserTier>("rollout");
  const tierCfg = getTierConfig(tier);

  useEffect(() => {
    setTierState(getTier());
  }, []);

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("Spotify");
  const [intentValue, setIntentValue] = useState(CREATIVE_INTENTS[0].value);
  const [styleFamily, setStyleFamily] = useState("auto");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [showTierModal, setShowTierModal] = useState(false);
  // Creative desk: the style sets the start, Early Access/Admin add tweaks.
  const { user } = useAuth();
  const canEditDesk = !!user && canAccessCreativeDesk(user.role);
  const [deskTweaks, setDeskTweaks] = useState<DeskTweaks>({});
  const desk = effectiveDesk(styleFamily, deskTweaks);
  const onDeskChange = useCallback(
    (key: DeskKey, value: number) => {
      if (!canEditDesk) return;
      setDeskTweaks((t) => ({ ...t, [key]: tweakFor(styleFamily, key, value) }));
    },
    [canEditDesk, styleFamily],
  );
  const onDeskReset = useCallback(() => setDeskTweaks({}), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDurationExceeded =
    fileDuration !== null && fileDuration > tierCfg.maxDurationSec + 0.05;

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      const ext = file.name.toLowerCase().split(".").pop();
      if (!ext || !ACCEPTED_EXTS.includes(ext)) {
        setError("Upload a WAV, FLAC, AIFF, M4A, MP3, AAC, OGG or Opus file.");
        return;
      }
      setError(null);
      setSelectedFile(file);
      try {
        const duration = await getAudioDurationSec(file);
        setFileDuration(duration);
      } catch {
        setFileDuration(null);
      }
    },
    [],
  );

  const handleMaster = useCallback(async () => {
    if (!selectedFile || isDurationExceeded) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      await new Promise<void>((r) => setTimeout(r, 40));
      setProgress(0.3);
      const creative = canEditDesk && hasTweaks(deskTweaks) ? JSON.stringify(deskTweaks) : undefined;
      const { job_id } = await createJob(selectedFile, platform, intentValue, true, styleFamily, creative);
      setProgress(1);
      router.push(`/processing/${job_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }, [selectedFile, platform, intentValue, styleFamily, router, isDurationExceeded, canEditDesk, deskTweaks]);

  const handleTierSelect = useCallback((t: UserTier) => {
    setTier(t);
    setTierState(t);
    setShowTierModal(false);
    // Re-check file duration against new tier
    if (selectedFile && fileDuration !== null) {
      const newCfg = getTierConfig(t);
      if (fileDuration > newCfg.maxDurationSec + 0.05) {
        setError(`Track exceeds the ${newCfg.maxDurationLabel} limit for ${newCfg.label}.`);
      } else {
        setError(null);
      }
    }
  }, [selectedFile, fileDuration]);

  const fmt = (b: number) =>
    b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const fmtDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
  };

  return (
    <>
      {showTierModal && (
        <TierSwitchModal
          currentTier={tier}
          onSelect={handleTierSelect}
          onClose={() => setShowTierModal(false)}
        />
      )}
      <UploadNeon
        dragOver={dragOver}
        setDragOver={setDragOver}
        busy={busy}
        progress={progress}
        error={error}
        setError={setError}
        platform={platform}
        setPlatform={setPlatform}
        intentValue={intentValue}
        setIntentValue={setIntentValue}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        fileDuration={fileDuration}
        setFileDuration={setFileDuration}
        tier={tier}
        showTierModal={showTierModal}
        setShowTierModal={setShowTierModal}
        tierCfg={tierCfg}
        handleTierSelect={handleTierSelect}
        onFiles={onFiles}
        handleMaster={handleMaster}
        inputRef={inputRef}
        fmt={fmt}
        fmtDur={fmtDur}
        isDurationExceeded={isDurationExceeded}
        PLATFORMS={PLATFORMS}
        CREATIVE_INTENTS={CREATIVE_INTENTS}
        styleFamily={styleFamily}
        setStyleFamily={setStyleFamily}
        STYLE_FAMILIES={STYLE_FAMILIES}
        desk={desk}
        deskTweaks={deskTweaks}
        canEditDesk={canEditDesk}
        onDeskChange={onDeskChange}
        onDeskReset={onDeskReset}
      />
    </>
  );
}
