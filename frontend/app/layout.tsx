import { AppShell } from "@/components/layout/AppShell";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KORD — AI Mastering",
  description: "Precision mastering powered by AI. Professional-grade masters, streaming-ready.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(110,231,255,0.07),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_50%_30%_at_90%_100%,rgba(167,139,250,0.05),transparent)]" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_40%_25%_at_5%_85%,rgba(240,180,41,0.03),transparent)]" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
