"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet/80">Sign Up</p>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Sign up is currently disabled</h1>
        <p className="mt-3 text-sm text-mist-200/50">
          We&apos;re in early access. Request an invite to get started.
        </p>
        <Link
          href="/access-request"
          className="mt-6 block w-full rounded-xl bg-violet py-3 text-sm font-bold text-white"
        >
          Request Early Access
        </Link>
        <p className="mt-5 text-center text-xs text-mist-200/45">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
