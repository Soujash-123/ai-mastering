import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent/60">404</p>
      <h1 className="text-2xl font-extrabold text-white">Page not found</h1>
      <p className="max-w-sm text-sm text-mist-200/50">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
      >
        Back to Studio
      </Link>
    </main>
  );
}
