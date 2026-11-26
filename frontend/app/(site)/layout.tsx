import { anek, plexMono } from "@/lib/landing/fonts";
import s from "@/components/marketing/landing.module.css";
import { UtmCapture } from "@/components/marketing/UtmCapture";

// Public marketing pages. No auth provider here, so pages render statically
// with their full content in the HTML.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${anek.variable} ${plexMono.variable} ${s.site}`}>
      <UtmCapture />
      {children}
    </div>
  );
}
