import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Terms of use | Kord",
  description: "Terms of use for Kord Studio, a Syntalix LLP product.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      {/* TODO(soujash): replace with the final terms of use from legal. */}
      <p>Our terms of use are being finalised and will be published here before Kord opens to everyone.</p>
    </LegalPage>
  );
}
