/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07090f", 900: "#0b0f1a", 800: "#111828", 700: "#1a2235" },
        mist: { 200: "#c9d1e3", 100: "#e6eaf5", 50: "#f6f7fb" },
        accent: { DEFAULT: "#6ee7ff", dim: "#2bb5d6" },
        gold: { DEFAULT: "#f0b429", dim: "#b5851f" },
        violet: { DEFAULT: "#a78bfa", dim: "#7c3aed" },
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
        "pulse-ring": "pulse-ring 2.4s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.45s ease forwards",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "shimmer": "shimmer 3s linear infinite",
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
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 16px rgba(110,231,255,0.25)" },
          "50%": { boxShadow: "0 0 36px rgba(110,231,255,0.5)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "0% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
      },
    },
  },
  plugins: [],
};
