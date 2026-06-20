import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "KORD — AI Mastering",
  description: "Precision mastering powered by AI. Professional-grade masters, streaming-ready.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950">
        {/* Ambient background layers */}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(110,231,255,0.07),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_50%_30%_at_90%_100%,rgba(167,139,250,0.05),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_40%_25%_at_5%_85%,rgba(240,180,41,0.03),transparent)]" />

        {/* Nav */}
        <nav className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* Hexagon logo */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path
                  d="M14 2L25 8V20L14 26L3 20V8L14 2Z"
                  stroke="rgba(110,231,255,0.6)"
                  strokeWidth="1.2"
                  fill="rgba(110,231,255,0.07)"
                />
                <path
                  d="M14 8L20 11.5V18.5L14 22L8 18.5V11.5L14 8Z"
                  fill="rgba(110,231,255,0.25)"
                />
              </svg>
              <span className="text-sm font-bold tracking-[0.22em] text-white group-hover:text-accent transition-colors duration-200">
                KORD
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-accent/60">
                <path d="M6.5 1L12 4V9L6.5 12L1 9V4L6.5 1Z" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-mist-200/50">
                Studio
              </span>
            </div>
          </div>
        </nav>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
      </body>
    </html>
  );
}

