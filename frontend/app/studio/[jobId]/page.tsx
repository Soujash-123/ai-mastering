"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MasteringTable } from "@/components/studio/MasteringTable";
import { canAccessMasteringTable } from "@/lib/auth";
import { fetchStudio } from "@/lib/studio/api";
import type { StudioData } from "@/lib/studio/types";

export default function StudioPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const { user, loading } = useAuth();
  const allowed = !!user && canAccessMasteringTable(user.role);
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || !jobId) return;
    let cancelled = false;
    fetchStudio(jobId)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not open the Mastering Table"));
    return () => {
      cancelled = true;
    };
  }, [allowed, jobId]);

  if (loading) return null;

  if (!allowed) {
    return (
      <Gate title="Mastering Table is in BETA">
        The Mastering Table is available to Early Access members while it&apos;s in beta.
      </Gate>
    );
  }
  if (error) return <Gate title="Couldn't open the Mastering Table">{error}</Gate>;
  if (!data) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
          <p className="text-[12px] text-white/50">Setting up your mastering table…</p>
        </div>
      </div>
    );
  }
  return <MasteringTable initial={data} />;

  function Gate({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="rounded-md bg-gradient-to-r from-violet-400 to-cyan-400 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-black">BETA</span>
        <h1 className="text-lg font-bold text-white">{title}</h1>
        <p className="text-sm text-white/55">{children}</p>
        <Link href={`/result/${jobId}`} className="mt-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
          Back to your master
        </Link>
      </div>
    );
  }
}
