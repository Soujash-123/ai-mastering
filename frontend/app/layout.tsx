import { AppShell } from "@/components/layout/AppShell";
import type { Metadata } from "next";
import { Sora, Outfit } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "KORD — AI Mastering",
  description: "Precision mastering powered by AI. Professional-grade masters, streaming-ready.",
  icons: { icon: "/logo-title.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`theme-neon ${sora.variable} ${outfit.variable}`}>
      <body className="min-h-screen antialiased" style={{ backgroundColor: "#09090b", color: "#e6eaf5" }}>
        {/* Neon waveform ambient layers */}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(110,231,255,0.09),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_55%_35%_at_90%_100%,rgba(167,139,250,0.06),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_40%_25%_at_5%_85%,rgba(0,255,180,0.04),transparent)]" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
