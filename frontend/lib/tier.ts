/**
 * KORD User Tier System
 *
 * Rollout     - general availability users
 * Early Access - beta/invited users with extended capabilities
 *
 * Tier is stored in localStorage so it persists across page loads,
 * but can be changed by the user at the gate screen (simulating auth).
 */

export type UserTier = "rollout" | "early_access";

export const TIER_CONFIG = {
    rollout: {
        label: "Rollout",
        badge: "Standard",
        maxDurationSec: 120,       // 2 minutes
        maxDurationLabel: "2 min",
        canAccessAdvancedSettings: false,
        canPlaySimulations: false,  // streaming & device simulation player
        canPlayMastered: true,      // play the final master
        canDownloadMastered: true,
        color: "#a78bfa",           // violet
        description: "Upload up to 2 minutes · Download & play your master",
    },
    early_access: {
        label: "Early Access",
        badge: "Early Access",
        maxDurationSec: 300,       // 5 minutes
        maxDurationLabel: "5 min",
        canAccessAdvancedSettings: true,
        canPlaySimulations: true,
        canPlayMastered: true,
        canDownloadMastered: true,
        color: "#6ee7ff",           // accent cyan
        description: "Upload up to 5 minutes · Advanced Settings · Simulations · Full access",
    },
} as const;

const STORAGE_KEY = "kord_user_tier";

export function getTier(): UserTier {
    if (typeof window === "undefined") return "rollout";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "early_access" || stored === "rollout") return stored;
    return "rollout";
}

export function setTier(tier: UserTier): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, tier);
}

export function getTierConfig(tier: UserTier) {
    return TIER_CONFIG[tier];
}
