"use client";

import { useEffect } from "react";
import { captureUtm } from "@/lib/utm";

/** Stores UTM tags from the landing URL for the access-request form (see lib/utm.ts). Renders nothing. */
export function UtmCapture() {
  useEffect(() => {
    captureUtm();
  }, []);
  return null;
}
