/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bio: {
          bg: "#0f1419",
          panel: "#1a2332",
          border: "#2d3a4f",
          accent: "#3b82f6",
          dna: "#22c55e",
          rna: "#a855f7",
          protein: "#f59e0b",
          restriction: "#ef4444",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
