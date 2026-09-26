/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3B82F6",
        primaryDark: "#1D4ED8",
        secondary: "#1E293B",
        surface: "#0F172A",
        surfaceLight: "#334155",
        textMuted: "#94A3B8",
      },
    },
  },
  plugins: [],
};