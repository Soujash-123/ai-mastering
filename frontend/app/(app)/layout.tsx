import { AppShell } from "@/components/layout/AppShell";
import { anek, plexMono } from "@/lib/landing/fonts";

// Signed-in app chrome. Same type as the public site (Anek Latin + IBM Plex
// Mono); the app runs on the ink ground.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${anek.variable} ${plexMono.variable} min-h-screen bg-ink text-paper`}
      style={{ fontFamily: "var(--f-anek), 'Arial Narrow', sans-serif" }}
    >
      <AppShell>{children}</AppShell>
    </div>
  );
}
