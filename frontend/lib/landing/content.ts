// Landing-page content shared by /design-lab and /.
// Every style claim below comes from backend/mastering/style_profiles.py
// (STYLE_PROFILES). Keep the two in sync when a profile changes.

export type StyleFamily = {
  key: string;
  name: string;
  line: string;
  lufs: [number, number];
  /** Compression ratio ceiling; null = no extra cap in the profile. */
  maxRatio: number | null;
  minAttackMs: number;
  minReleaseMs: number;
  protects: string;
};

export const STYLE_FAMILIES: StyleFamily[] = [
  {
    key: "indian_classical",
    name: "Hindustani and Carnatic",
    line: "Compression stays at a gentle 1.5:1 with a slow release. The quiet alaap stays quiet, the tanpura never pumps, and tabla and mridangam strokes keep their attack.",
    lufs: [-16, -14],
    maxRatio: 1.5,
    minAttackMs: 25,
    minReleaseMs: 220,
    protects: "Drone, gamakas, wide dynamics",
  },
  {
    key: "devotional",
    name: "Bhajan, kirtan and qawwali",
    line: "Warm and close. Control is gentle, 2:1 at most, so the room and the harmonium's body stay, and the highs never turn brittle.",
    lufs: [-15, -13],
    maxRatio: 2,
    minAttackMs: 18,
    minReleaseMs: 160,
    protects: "Room sound, harmonium body",
  },
  {
    key: "film_melodic",
    name: "Film and playback songs",
    line: "The vocal leads. A dynamic EQ calms the 2–5 kHz edge on bright high notes, so the song sounds polished without being crushed.",
    lufs: [-12, -10],
    maxRatio: 3,
    minAttackMs: 10,
    minReleaseMs: 90,
    protects: "Vocal clarity on high notes",
  },
  {
    key: "bollywood_dance",
    name: "Bollywood, Punjabi and dance",
    line: "Loud enough to sit next to commercial releases. Dhol and kick keep their punch, and the sub is held in mono so the low end stays tight under the bass.",
    lufs: [-10, -8],
    maxRatio: null,
    minAttackMs: 8,
    minReleaseMs: 60,
    protects: "Dhol and kick punch, mono sub",
  },
  {
    key: "fusion_indie",
    name: "Fusion and indie",
    line: "For acoustic Indian instruments next to modern production. Percussion keeps its attack and instruments sound real, with a balanced, modern finish.",
    lufs: [-13, -10],
    maxRatio: 2.5,
    minAttackMs: 15,
    minReleaseMs: 120,
    protects: "Percussion attack, instrument realism",
  },
];

/** Export targets from backend/exports/pcm_export.py and analysis/pipeline.py. */
export const EXPORT_TARGETS = [
  { name: "Spotify", lufs: -14, format: "FLAC" },
  { name: "Apple Music", lufs: -16, format: "WAV" },
  { name: "Broadcast", lufs: -24, format: "WAV" },
] as const;

export const TRUE_PEAK_DBTP = -1;

export const ACCESS_HREF = "/access-request";

export const SITE_URL = "https://kordstudio.syntalixconsultancy.com";

// TODO(soujash): contact email. The footer shows a contact link only once this is set.
export const CONTACT_EMAIL = "";
