"use client";

import { useState } from "react";
import { EarlyAccessModal } from "@/components/auth/EarlyAccessModal";
import { useAuth } from "@/components/auth/AuthProvider";

export function RestrictedFeature() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-violet/20 bg-violet/[0.06] p-6 text-center">
        <p className="text-sm font-semibold text-white">
          This feature is currently available only to Early Access users.
        </p>
        <p className="mt-2 text-xs text-mist-200/50">
          Streaming and device simulations let you preview how your master translates across platforms.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-xl bg-violet px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet/90"
        >
          Request Early Access
        </button>
      </div>
      <EarlyAccessModal
        open={open}
        onClose={() => setOpen(false)}
        defaultEmail={user?.email}
        defaultName={user?.full_name}
      />
    </>
  );
}
