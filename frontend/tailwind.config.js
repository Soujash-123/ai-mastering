/** @type {import('tailwindcss').Config} */

// Kord design system, shared by the public site and the app.
// Print world: ink ground, paper text, one accent, a secondary and an alert
// colour. The actual colours are palettes in app/palettes.css.
//
// The legacy neon palette names used across the app (cyan, violet, lime, ...)
// are remapped here so existing class names render in the new system without
// touching component logic. New code should use the semantic names
// (turmeric, rani, paper, ink).

// Colours come from the palette roles in app/palettes.css ("R G B" triplets),
// so Tailwind opacity modifiers keep working: bg-cyan-400/10 etc.
const v = (role) => `rgb(var(--k-${role}) / <alpha-value>)`;
const scale = (light, base, deep = base) => ({
  50: v(light), 100: v(light), 200: v(light), 300: v(light),
  400: v(base), 500: v(base), 600: v(deep), 700: v(deep), 800: v(deep), 900: v(deep), 950: v(deep),
  DEFAULT: v(base),
});

const turmeric = scale("accent-hi", "accent");
const rani = scale("alert-hi", "alert", "second");
const leaf = scale("ok", "ok", "ok-deep");
// Neutrals: light end for text on dark, dark end for grounds.
const inkScale = {
  50: v("paper"), 100: v("paper"), 200: v("paper-soft"), 300: v("paper-soft"),
  400: v("mid"), 500: v("mid"), 600: v("ink-soft"), 700: v("ink-soft"),
  800: v("ink-2"), 900: v("ink"), 950: v("ink-3"), DEFAULT: v("ink"),
};

module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--f-anek)", "Arial Narrow", "sans-serif"],
        outfit: ["var(--f-anek)", "Arial Narrow", "sans-serif"],
        mono: ["var(--f-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Semantic names
        turmeric,
        rani,
        leaf,
        paper: { DEFAULT: v("paper"), bright: v("paper-2"), soft: v("paper-soft") },
        ink: inkScale,
        // Paper replaces pure white so text and hairlines follow the palette.
        white: v("paper"),
        black: v("ink-3"),
        // Legacy names -> new system
        cyan: turmeric,
        sky: turmeric,
        teal: turmeric,
        amber: turmeric,
        yellow: turmeric,
        orange: turmeric,
        gold: { DEFAULT: v("accent"), dim: v("accent") },
        accent: { DEFAULT: v("accent"), dim: v("accent") },
        violet: rani,
        purple: rani,
        fuchsia: rani,
        pink: rani,
        rose: rani,
        red: rani,
        lime: leaf,
        emerald: leaf,
        green: leaf,
        zinc: inkScale,
        slate: inkScale,
        gray: inkScale,
        neutral: inkScale,
        mist: { 200: v("paper-soft"), 100: v("paper"), 50: v("paper-2") },
      },
      // Print world: near-square corners. "full" stays round for knobs and dots.
      borderRadius: {
        sm: "1px",
        DEFAULT: "2px",
        md: "2px",
        lg: "3px",
        xl: "3px",
        "2xl": "4px",
        "3xl": "4px",
      },
      // No frosted glass.
      backdropBlur: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
        "pulse-ring": "pulse-ring 2.4s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.45s ease forwards",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.06)", opacity: "0.15" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Former neon glow: now a quiet opacity breath with no halo.
        "glow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.75" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
      },
    },
  },
  plugins: [],
};
