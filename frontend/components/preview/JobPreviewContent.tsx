"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { AudioComparisonPlayer } from "@/components/preview/AudioComparisonPlayer";
import { StreamingPreviewTabs } from "@/components/preview/StreamingPreviewTabs";
import { GlowCard } from "@/components/ui/GlowCard";
import { NeonButton } from "@/components/ui/NeonButton";
import { apiUrl, type JobResult } from "@/lib/api";

type Props = {
  jobId: string;
  data: JobResult;
};

export function JobPreviewContent({ jobId, data }: Props) {
  const [platform, setPlatform] = useState(
    () => (data.analysis?.target_platform as string) || "Spotify",
  );
  const beforeUrl = apiUrl(data.input_url);
  const afterUrl = apiUrl(data.master_wav_url);
  const report = data.report ?? {};
  const bullets = Array.isArray(report.bullets) ? report.bullets : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <motion.div>
          <p className="text-xs uppercase tracking-[0.2em] text-neon-purple">Master preview</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Before &amp; After</h1>
        </motion.div>
        <Link href={`/export/${jobId}`}>
          <NeonButton size="lg">
            Continue to Export
            <ArrowRight className="h-5 w-5" />
          </NeonButton>
        </Link>
      </div>

      <AudioComparisonPlayer
        beforeUrl={beforeUrl}
        afterUrl={afterUrl}
        durationSec={data.analysis?.duration_sec as number | undefined}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8"
      >
        <StreamingPreviewTabs active={platform} onChange={setPlatform} />
      </motion.div>

      {bullets.length > 0 || report.analysis_summary ? (
        <GlowCard className="mt-8">
          <motion.div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-neon-purple" />
            <div>
              <h2 className="font-semibold">AI Mastering Summary</h2>
              {bullets.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
                  {bullets.map((b, i) => (
                    <li key={i}>• {b}</li>
                  ))}
                </ul>
              )}
              {report.analysis_summary && (
                <p className="mt-4 text-sm text-white/50">{report.analysis_summary}</p>
              )}
            </div>
          </motion.div>
        </GlowCard>
      ) : null}
    </motion.div>
  );
}
