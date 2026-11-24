import { getTierConfig, type UserTier } from "@/lib/tier";
import { alpha } from "@/lib/colors";

// Kord palette for the tier marks (the colours in lib/tier.ts are the old neon ones).
const tierTone = (t: UserTier) => (t === "early_access" ? "rgb(var(--k-accent))" : "rgb(var(--k-paper))");

/** Pill badge showing current tier with a switch trigger */
export function TierBadge({ tier, onSwitch }: { tier: UserTier; onSwitch: () => void }) {
  const cfg = getTierConfig(tier);
  const isEA = tier === "early_access";
  return (
    <button
      type="button"
      onClick={onSwitch}
      title="Click to switch tier"
      className="group flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold transition-all hover:scale-105"
      style={{
        borderColor: isEA ? "rgb(var(--k-accent) / 0.35)" : "rgb(var(--k-alert) / 0.35)",
        background: isEA ? "rgb(var(--k-accent) / 0.06)" : "rgb(var(--k-alert) / 0.06)",
        color: isEA ? "rgb(var(--k-accent) / 0.85)" : "rgb(var(--k-alert) / 0.85)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tierTone(tier) }}
      />
      {cfg.badge}
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="opacity-50 group-hover:opacity-100">
        <path d="M7.5 1.5A4 4 0 102.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M7.5 1.5L6 3.5l2 .5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Modal for switching tiers */
export function TierSwitchModal({
  currentTier,
  onSelect,
  onClose,
}: {
  currentTier: UserTier;
  onSelect: (t: UserTier) => void;
  onClose: () => void;
}) {
  const tiers: UserTier[] = ["rollout", "early_access"];
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgb(var(--k-ink) / 0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/[0.09] bg-ink-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-5 text-xl font-extrabold text-white">Select your tier</h2>
        <div className="space-y-3">
          {tiers.map((t) => {
            const cfg = getTierConfig(t);
            const active = t === currentTier;
            const isEA = t === "early_access";
            return (
              <button
                key={t}
                type="button"
                onClick={() => onSelect(t)}
                className="group w-full rounded-2xl border p-4 text-left transition-all"
                style={{
                  borderColor: active
                    ? `${alpha(tierTone(t), 0.33)}`
                    : "rgb(var(--k-paper) / 0.07)",
                  background: active
                    ? `${alpha(tierTone(t), 0.05)}`
                    : "rgb(var(--k-paper) / 0.02)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
                      style={{
                        background: `${alpha(tierTone(t), 0.09)}`,
                        border: `1px solid ${alpha(tierTone(t), 0.21)}`,
                        color: tierTone(t),
                      }}
                    >
                      {isEA ? "EA" : "R"}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">{cfg.label}</p>
                      <p className="text-[11px] text-mist-200/40">Upload up to {cfg.maxDurationLabel}</p>
                    </div>
                  </div>
                  {active && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold "
                      style={{ background: `${alpha(tierTone(t), 0.13)}`, color: tierTone(t) }}
                    >
                      Active
                    </span>
                  )}
                </div>
                <ul className="mt-3 space-y-1 pl-9">
                  {[
                    `Upload up to ${cfg.maxDurationLabel} of audio`,
                    ...(cfg.canAccessAdvancedSettings ? ["Advanced Settings"] : []),
                    ...(cfg.canPlaySimulations ? ["Streaming & Device Simulations"] : []),
                    "Play & download mastered audio",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5 text-xs text-mist-200/55">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5l2.5 2.5 3.5-4"
                          stroke={tierTone(t)}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.7"
                        />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl py-2.5 text-xs text-mist-200/40 transition hover:text-mist-200/70"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
