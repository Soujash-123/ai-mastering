import fs from "node:fs";
import path from "node:path";

// Before/after examples for the landing-page player.
//
// Each pair can come from EITHER source (local files win when both are set):
//
// 1. Local files in frontend/public/audio/ named <slug>-before.mp3 and
//    <slug>-after.mp3. Both sides must have the same length (the player keeps
//    them in lockstep). Current pair: input.wav (before) and the Kord master
//    input_mastered.flac (after), full 69.9 s, 224 kbps MP3.
// 2. An external embed: set `embedUrl` below to a SoundCloud track/playlist URL
//    or a YouTube video URL (watch, youtu.be or embed links all work). The
//    clip itself should play the before and then the after version.
//
// A pair appears only when one of the two is present at build time. When no
// pair is available, the whole "Listen" section (and every link to it) is
// hidden. With a single pair the track tabs are hidden too.

/** `style` is optional; when set, the player footer reads "<style> style." */
export type AudioPairDef = { slug: string; label: string; style?: string; embedUrl?: string };

export const AUDIO_PAIRS: AudioPairDef[] = [{ slug: "example", label: "Example track" }];

export type LocalAudioPair = AudioPairDef & { kind: "local"; before: string; after: string; bytes: number };
export type EmbedAudioPair = AudioPairDef & { kind: "embed"; embedSrc: string; provider: "SoundCloud" | "YouTube" };
export type AudioPair = LocalAudioPair | EmbedAudioPair;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Turns a SoundCloud or YouTube page/embed URL into an iframe src, or null for anything else. */
export function toEmbed(raw: string | undefined): Pick<EmbedAudioPair, "embedSrc" | "provider"> | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "w.soundcloud.com" && url.pathname.startsWith("/player")) {
    return { embedSrc: url.toString(), provider: "SoundCloud" };
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    const params = new URLSearchParams({
      url: url.toString(),
      auto_play: "false",
      hide_related: "true",
      show_comments: "false",
      show_reposts: "false",
      visual: "false",
    });
    return { embedSrc: `https://w.soundcloud.com/player/?${params}`, provider: "SoundCloud" };
  }

  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      id = m ? m[1] : null;
    }
  }
  if (id && YT_ID.test(id)) {
    return { embedSrc: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, provider: "YouTube" };
  }
  return null;
}

/** Server-only: resolves which pairs are available at build time. */
export function availableAudioPairs(): AudioPair[] {
  const dir = path.join(process.cwd(), "public", "audio");
  return AUDIO_PAIRS.flatMap((p): AudioPair[] => {
    try {
      const before = fs.statSync(path.join(dir, `${p.slug}-before.mp3`));
      const after = fs.statSync(path.join(dir, `${p.slug}-after.mp3`));
      return [
        {
          ...p,
          kind: "local",
          before: `/audio/${p.slug}-before.mp3`,
          after: `/audio/${p.slug}-after.mp3`,
          bytes: before.size + after.size,
        },
      ];
    } catch {
      const embed = toEmbed(p.embedUrl);
      return embed ? [{ ...p, kind: "embed", ...embed }] : [];
    }
  });
}
