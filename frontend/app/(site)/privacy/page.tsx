import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { APP_TITLE } from "@/lib/landing/content";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: APP_TITLE,
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
      {/* Same wording as the FAQ in lib/landing/faq.ts; keep the two identical. */}
      <p>
        Working files are deleted about 10 minutes after you stop working on a track; finished masters are kept for up to 12 hours.
      </p>
    </LegalPage>
  );
}
