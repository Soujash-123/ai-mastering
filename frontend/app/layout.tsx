import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mastering",
  description: "Adaptive, analysis-driven mastering with streaming-aware exports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(110,231,255,0.12),_transparent_55%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-10">{children}</div>
      </body>
    </html>
  );
}
