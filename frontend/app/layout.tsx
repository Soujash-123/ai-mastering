import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kordstudio.syntalixconsultancy.com"),
  title: "KORD — AI Mastering",
  description: "Precision mastering powered by AI. Professional-grade masters, streaming-ready.",
  icons: { icon: "/logo-title.png" },
};

// Root shell only. The signed-in app chrome and its fonts (AppShell,
// AuthProvider, Sora/Outfit) live in app/(app)/layout.tsx, so the public pages
// in app/(site) render statically and don't download the app's fonts.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="theme-neon" suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={{ backgroundColor: "rgb(var(--k-ink))", color: "rgb(var(--k-paper))" }}>
        {children}
      </body>
    </html>
  );
}
