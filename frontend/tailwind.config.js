/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07080c", 900: "#0c0f16", 800: "#121722" },
        mist: { 200: "#c9d1e3", 100: "#e6eaf5", 50: "#f6f7fb" },
        accent: { DEFAULT: "#6ee7ff", dim: "#2bb5d6" },
      },
    },
  },
  plugins: [],
};
