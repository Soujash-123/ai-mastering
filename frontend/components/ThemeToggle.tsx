"use client";

// Theme is permanently Neon — this component is a no-op kept for import compatibility.
export function ThemeToggle() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="mb-[1px]">
        <path d="M9.5 1L2.5 9h5l-1.5 6 7.5-8h-5l1.5-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="currentColor"/>
      </svg>
      <span>Neon</span>
    </div>
  );
}
