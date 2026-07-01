"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

const PUBLIC_PATHS = new Set(["/login", "/signup"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShellInner>{children}</AppShellInner>
    </AuthProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.has(pathname);

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" prefetch={false} className="group flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L25 8V20L14 26L3 20V8L14 2Z" stroke="rgba(110,231,255,0.6)" strokeWidth="1.2" fill="rgba(110,231,255,0.07)" />
              <path d="M14 8L20 11.5V18.5L14 22L8 18.5V11.5L14 8Z" fill="rgba(110,231,255,0.25)" />
            </svg>
            <span className="text-sm font-bold tracking-[0.22em] text-white group-hover:text-accent transition-colors duration-200">
              KORD
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {isPublic ? (
              <>
                <Link href="/login" className="text-xs text-mist-200/55 hover:text-white">Login</Link>
                <Link href="/signup" className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
                  Sign Up
                </Link>
              </>
            ) : (
              <ProfileMenu />
            )}
          </div>
        </div>
      </nav>
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </>
  );
}
