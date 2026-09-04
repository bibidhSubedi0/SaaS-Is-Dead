/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        "panel-hover": "rgb(var(--c-panel-hover) / <alpha-value>)",
        "panel-edge": "rgb(var(--c-panel-edge) / <alpha-value>)",
        sidebar: "rgb(var(--c-sidebar) / <alpha-value>)",
        text: {
          DEFAULT: "rgb(var(--c-text) / <alpha-value>)",
          dim: "rgb(var(--c-text-dim) / <alpha-value>)",
          faint: "rgb(var(--c-text-faint) / <alpha-value>)",
        },
        amber: "rgb(var(--c-amber) / <alpha-value>)",
        rose: "rgb(var(--c-rose) / <alpha-value>)",
        orange: "rgb(var(--c-orange) / <alpha-value>)",
        sage: "rgb(var(--c-sage) / <alpha-value>)",
        teal: "rgb(var(--c-teal) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.5)",
        "panel-light": "0 1px 0 0 rgba(255,255,255,0.6) inset, 0 8px 24px -14px rgba(60,40,20,0.18)",
      },
    },
  },
  plugins: [],
};