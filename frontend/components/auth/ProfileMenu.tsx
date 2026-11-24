"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { roleBadgeLabel } from "@/lib/auth";
import s from "./profile.module.css";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = user.full_name.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={s.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.full_name}`}
      >
        <span className={s.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={s.name}>{user.full_name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={s.chev} aria-hidden="true">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
        </svg>
      </button>

      {open && (
        <>
          <button type="button" className={s.backdrop} aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className={s.menu} role="menu">
            <div className={s.info}>
              <p className={s.fullName}>{user.full_name}</p>
              <p className={s.email}>{user.email}</p>
              <span className={s.role}>{roleBadgeLabel(user.role)}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className={s.signOut}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9.5 5v-2a1 1 0 00-1-1h-5a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" />
                <path d="M6 7h6M10 5l2 2-2 2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
