import { Anek_Latin, IBM_Plex_Mono } from "next/font/google";

// Public site type: Anek Latin (variable width, display and text) and
// IBM Plex Mono for measured numbers only.
export const anek = Anek_Latin({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--f-anek",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--f-mono",
  display: "swap",
  preload: false,
});
