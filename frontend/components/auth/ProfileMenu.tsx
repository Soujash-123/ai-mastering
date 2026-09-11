"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { roleBadgeLabel } from "@/lib/auth";

const ROLE_STYLES: Record<string, { border: string; bg: string; color: string; glow: string }> = {
  ADMIN: { border: "rgba(240,180,41,0.4)", bg: "rgba(240,180,41,0.1)", color: "#f0b429", glow: "rgba(240,180,41,0.25)" },
  EARLY_ACCESS: { border: "rgba(34,211,238,0.4)", bg: "rgba(34,211,238,0.1)", color: "#22d3ee", glow: "rgba(34,211,238,0.25)" },
  ROLLOUT: { border: "rgba(163,230,53,0.4)", bg: "rgba(163,230,53,0.1)", color: "#a3e635", glow: "rgba(163,230,53,0.2)" },
};

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const role = ROLE_STYLES[user.role] ?? ROLE_STYLES.ROLLOUT;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-all duration-200"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(34,211,238,0.06)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
        }}
      >
        {/* Avatar */}
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black"
          style={{
            background: `${role.bg}`,
            border: `1px solid ${role.border}`,
            color: role.color,
            boxShadow: `0 0 10px ${role.glow}`,
          }}
        >
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[110px] truncate sm:inline text-white/70 font-medium">
          {user.full_name}
        </span>
        {/* Role badge */}
        <span
          className="hidden sm:inline rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{
            border: `1px solid ${role.border}`,
            background: role.bg,
            color: role.color,
          }}
        >
          {roleBadgeLabel(user.role)}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/30 shrink-0">
          <path d={open ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            style={{
              background: "rgba(9,9,11,0.96)",
              border: "1px solid rgba(34,211,238,0.12)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* User info */}
            <div className="px-4 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black shrink-0"
                  style={{
                    background: role.bg,
                    border: `1px solid ${role.border}`,
                    color: role.color,
                    boxShadow: `0 0 14px ${role.glow}`,
                  }}
                >
                  {user.full_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
                  <p className="truncate text-[11px] text-white/40">{user.email}</p>
                </div>
              </div>
              <div
                className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest"
                style={{ background: role.bg, border: `1px solid ${role.border}`, color: role.color }}
              >
                {roleBadgeLabel(user.role)}
              </div>
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                type="button"
                onClick={() => { setOpen(false); void logout(); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rose-400 transition-all hover:bg-rose-500/10 hover:text-rose-300"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9.5 5v-2a1 1 0 00-1-1h-5a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M6 7h6M10 5l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
