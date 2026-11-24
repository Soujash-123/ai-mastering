import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/landing/content";
import { StudioCta } from "./StudioCta";
import s from "./landing.module.css";

export function SiteHeader({ nav = true }: { nav?: boolean }) {
  return (
    <header className={s.header}>
      <div className={`${s.wrap} ${s.headerInner}`}>
        <Link href="/" className={s.wordmark} aria-label="Kord home">
          KORD
        </Link>
        {nav && (
          <nav aria-label="Sections" className={s.nav}>
            <a href="#listen">Listen</a>
            <a href="#styles">Styles</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
        )}
        <div className={s.headerActions}>
          <Link href="/login" prefetch={false} className={s.login}>
            Log in
          </Link>
          <StudioCta className={s.btn} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={`${s.wrap} ${s.footerInner}`}>
        <p>© {new Date().getFullYear()} Syntalix LLP. Kord is a Syntalix product.</p>
        <nav aria-label="Legal" className={s.footerLinks}>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login" prefetch={false}>
            Log in
          </Link>
          {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>}
        </nav>
      </div>
    </footer>
  );
}
