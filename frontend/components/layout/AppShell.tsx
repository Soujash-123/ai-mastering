"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/access-request"]);

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
      {/* ── Neon Navbar ── */}
      <nav
        className="sticky top-0 z-50 w-full backdrop-blur-xl"
        style={{
          backgroundColor: "rgba(9,9,11,0.88)",
          borderBottom: "1px solid rgba(34,211,238,0.08)",
          boxShadow: "0 1px 0 rgba(34,211,238,0.05), 0 4px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-3">
          {/* Logo */}
          <Link href="/" prefetch={false} className="group flex items-center shrink-0">
            <Image
              src="/logo.png"
              alt="KORD Studio"
              width={96}
              height={48}
              className="h-10 w-auto object-contain transition-opacity duration-200 group-hover:opacity-80"
              style={{ filter: "drop-shadow(0 0 10px rgba(34,211,238,0.25))" }}
            />
          </Link>

          {/* Nav actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isPublic ? (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline text-xs font-medium text-white/45 hover:text-white transition-colors duration-200 px-2 py-1"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-cyan-400 transition-all duration-200 hover:-translate-y-px"
                  style={{
                    border: "1px solid rgba(34,211,238,0.28)",
                    background: "rgba(34,211,238,0.07)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(34,211,238,0.14)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 16px rgba(34,211,238,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(34,211,238,0.07)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v6M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="hidden sm:inline">Request Access</span>
                  <span className="sm:hidden">Access</span>
                </Link>
              </>
            ) : (
              <>
                {/* Live indicator */}
                <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-lime-400/20 bg-lime-400/[0.06] px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse shadow-[0_0_6px_#a3e635]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-lime-400/80">Live</span>
                </div>
                <ProfileMenu />
              </>
            )}
          </div>
        </div>

        {/* Bottom neon line accent */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
      </nav>

      {/* Page content */}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {children}
      </div>
    </>
  );
}
