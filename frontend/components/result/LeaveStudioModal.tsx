"use client";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LeaveStudioModal({ open, onCancel, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/75" aria-label="Close" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-accent/70">Before you leave</p>
        <h2 className="mt-2 text-xl font-bold text-white">Download your master first</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist-200/60">
          KORD does not keep your audio after you leave this page. If you have not downloaded your master yet, you will
          lose access to it.
        </p>
        <p className="mt-2 text-sm text-mist-200/45">Are you sure you want to return to the studio?</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-mist-200/70 transition hover:bg-white/[0.05]"
          >
            Stay on results
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:bg-accent/90"
          >
            Leave anyway
          </button>
        </div>
      </div>
    </div>
  );
}
