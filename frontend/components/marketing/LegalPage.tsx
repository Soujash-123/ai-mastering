import { SiteFooter, SiteHeader } from "./SiteChrome";
import s from "./landing.module.css";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader nav={false} />
      <main className={`${s.wrap} ${s.legal}`}>
        <h1>{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
