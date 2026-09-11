"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { wsUrl } from "@/lib/api";
import { ProcessingNeon } from "@/components/ProcessingNeon";

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("queued");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Starting…");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket progress stream
  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/ws/jobs/${jobId}`));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "progress") {
          setStatus(msg.status);
          setProgress(msg.progress ?? 0);
          setMessage(msg.message ?? "");
        } else if (msg.type === "result") {
          try { sessionStorage.setItem(`kord_result_${jobId}`, JSON.stringify(msg)); } catch { /* quota */ }
          router.push(`/result/${jobId}`);
        } else if (msg.type === "failed") {
          setStatus("failed");
          setMessage(msg.message || "Processing failed");
        }
      } catch { /* malformed frame */ }
    };
    ws.onerror = () => setMessage("Connection error — please refresh.");
    return () => { ws.close(); };
  }, [jobId, router]);

  const onCopyId = () => {
    void navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ProcessingNeon
      jobId={jobId}
      status={status}
      progress={progress}
      message={message}
      elapsed={elapsed}
      copied={copied}
      onCopyId={onCopyId}
      onBack={() => router.push("/")}
    />
  );
}
