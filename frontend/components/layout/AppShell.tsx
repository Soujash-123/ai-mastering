"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileMenu } from "@/components/auth/ProfileMenu";
import s from "./shell.module.css";

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
      <header className={s.header}>
        <div className={s.inner}>
          <Link href={isPublic ? "/" : "/studio"} prefetch={false} className={s.wordmark} aria-label="Kord home">
            KORD
          </Link>

          <div className={s.actions}>
            {isPublic ? (
              <>
                {pathname !== "/login" && (
                  <Link href="/login" className={s.login}>
                    Log in
                  </Link>
                )}
                {pathname !== "/access-request" && (
                  <Link href="/access-request" className={s.cta}>
                    Request access
                  </Link>
                )}
              </>
            ) : (
              <ProfileMenu />
            )}
          </div>
        </div>
      </header>

      {/* Auth pages run edge to edge; app pages sit in the content column. */}
      {isPublic ? children : <div className={s.content}>{children}</div>}
    </>
  );
}
