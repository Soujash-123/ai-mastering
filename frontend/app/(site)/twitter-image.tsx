import { ImageResponse } from "next/og";

export const alt = "Kord: release-ready masters for Indian music";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered once at build time in the site palette (Peacock & brass, app/palettes.css).
export default function OgImage() {
  const bars = Array.from({ length: 96 }, (_, i) => 18 + Math.abs(Math.sin(i * 0.37) * 60 + Math.sin(i * 1.3) * 30));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#d6aa4c",
          color: "#0b2426",
          padding: "64px 72px 0",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>KORD</div>
        <div style={{ display: "flex", fontSize: 100, fontWeight: 800, lineHeight: 0.95, maxWidth: 900 }}>
          Release-ready masters for Indian music
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, height: 140 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 6, height: h, background: i < 36 ? "#0e706c" : "#0b2426" }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
