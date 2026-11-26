import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/landing/content";

const PRIVATE = ["/studio", "/result", "/processing"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // Named explicitly so AI answer engines know they are welcome.
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
