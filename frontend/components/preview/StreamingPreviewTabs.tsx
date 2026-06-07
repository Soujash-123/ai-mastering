"use client";

type Props = {
  active: string;
  onChange: (platform: string) => void;
};

const platforms = ["Spotify", "Apple Music", "TikTok", "YouTube"];

export function StreamingPreviewTabs({ active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((platform) => (
        <button
          key={platform}
          type="button"
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            platform === active
              ? "border border-neon-purple bg-neon-purple/10 text-white"
              : "border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
          }`}
          onClick={() => onChange(platform)}
        >
          {platform}
        </button>
      ))}
    </div>
  );
}
