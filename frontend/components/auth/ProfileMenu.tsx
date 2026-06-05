"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { roleBadgeLabel } from "@/lib/auth";

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "border-gold/40 bg-gold/10 text-gold",
  EARLY_ACCESS: "border-accent/40 bg-accent/10 text-accent",
  ROLLOUT: "border-violet/40 bg-violet/10 text-violet",
};

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-mist-200/70 transition hover:bg-white/[0.07]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
          {user.full_name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[120px] truncate sm:inline">{user.full_name}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_STYLES[user.role]}`}>
          {roleBadgeLabel(user.role)}
        </span>
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
              <p className="truncate text-[11px] text-mist-200/45">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); void logout(); }}
              className="w-full px-4 py-3 text-left text-sm text-rose-300 transition hover:bg-white/[0.04]"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
