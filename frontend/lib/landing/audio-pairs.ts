import fs from "node:fs";
import path from "node:path";

// Before/after examples for the landing-page player.
//
// TODO(soujash): add 3 pairs to frontend/public/audio/ using exactly these file
// names (MP3, 30–45 s clips keep the page light on 4G), then rebuild:
//   bollywood-dance-before.mp3   bollywood-dance-after.mp3
//   devotional-before.mp3        devotional-after.mp3
//   indie-before.mp3             indie-after.mp3
// A pair appears only when both of its files exist at build time; until then
// the player shows its empty state.

export type AudioPairDef = { slug: string; label: string; style: string };

export const AUDIO_PAIRS: AudioPairDef[] = [
  { slug: "bollywood-dance", label: "Bollywood dance", style: "Bollywood, Punjabi and dance" },
  { slug: "devotional", label: "Devotional", style: "Bhajan, kirtan and qawwali" },
  { slug: "indie", label: "Indie", style: "Fusion and indie" },
];

export type AudioPair = AudioPairDef & { before: string; after: string; bytes: number };

/** Server-only: resolves which pairs are present in public/audio at build time. */
export function availableAudioPairs(): AudioPair[] {
  const dir = path.join(process.cwd(), "public", "audio");
  return AUDIO_PAIRS.flatMap((p) => {
    try {
      const before = fs.statSync(path.join(dir, `${p.slug}-before.mp3`));
      const after = fs.statSync(path.join(dir, `${p.slug}-after.mp3`));
      return [
        {
          ...p,
          before: `/audio/${p.slug}-before.mp3`,
          after: `/audio/${p.slug}-after.mp3`,
          bytes: before.size + after.size,
        },
      ];
    } catch {
      return [];
    }
  });
}
