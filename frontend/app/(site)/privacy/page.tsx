import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Privacy policy | Kord",
  description: "How Kord Studio, a Syntalix LLP product, handles your audio and personal data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      {/* TODO(soujash): replace with the final privacy policy text from legal. */}
      <p>Our full privacy policy is being finalised and will be published here before Kord opens to everyone.</p>
      <h2>Your audio files</h2>
      {/* Mirrors backend/services/job_store.py and utils/config.py (appwrite_ttl_hours). */}
      <p>
        Your upload and the working files are deleted about 10 minutes after you stop working on a track. The finished
        master is kept in cloud storage for up to 12 hours so you can download it, and is then deleted automatically.
      </p>
    </LegalPage>
  );
}
