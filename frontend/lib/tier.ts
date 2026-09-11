export type UserTier = "rollout" | "early_access";

export interface TierConfig {
  label: string;
  badge: string;
  color: string;
  maxDurationSec: number;
  maxDurationLabel: string;
  canAccessAdvancedSettings: boolean;
  canPlaySimulations: boolean;
}

const TIER_CONFIGS: Record<UserTier, TierConfig> = {
  rollout: {
    label: "Rollout",
    badge: "R",
    color: "#a78bfa",
    maxDurationSec: 600,
    maxDurationLabel: "10 minutes",
    canAccessAdvancedSettings: false,
    canPlaySimulations: false,
  },
  early_access: {
    label: "Early Access",
    badge: "EA",
    color: "#6ee7ff",
    maxDurationSec: 3600,
    maxDurationLabel: "60 minutes",
    canAccessAdvancedSettings: true,
    canPlaySimulations: true,
  },
};

const TIER_KEY = "kord_user_tier";

export function getTier(): UserTier {
  if (typeof window === "undefined") return "rollout";
  const stored = localStorage.getItem(TIER_KEY);
  if (stored === "early_access" || stored === "rollout") return stored;
  return "rollout";
}

export function setTier(tier: UserTier): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TIER_KEY, tier);
}

export function getTierConfig(tier: UserTier): TierConfig {
  return TIER_CONFIGS[tier];
}
