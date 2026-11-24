"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { ACCESS_HREF } from "@/lib/landing/content";

// Static HTML always carries "Request early access". After hydration a
// signed-in visitor gets "Go to studio" in the same slot instead.
export function StudioCta({ className }: { className?: string }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(!!getToken());
  }, []);
  return signedIn ? (
    <Link href="/studio" prefetch={false} className={className}>
      Go to studio
    </Link>
  ) : (
    <Link href={ACCESS_HREF} className={className}>
      Request early access
    </Link>
  );
}
