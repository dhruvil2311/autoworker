/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--aw-obsidian)",
        surface: "var(--aw-graphite)",
        "surface-container": "#181818",
        "surface-container-high": "#222222",
        "surface-container-highest": "#2c2c2c",
        
        "on-surface": "var(--aw-offwhite)",
        "on-surface-variant": "var(--aw-coolgray)",
        
        primary: "var(--aw-teal)",
        "primary-hover": "#00B8D4",
        "on-primary": "#000000",
        
        "secondary-container": "var(--aw-amber)",
        "on-secondary-container": "#451a03",
        
        error: "var(--aw-red)",
        success: "var(--aw-green)",
        purple: "var(--aw-purple)",

        outline: "#333333",
        "outline-variant": "#222222",
        "outline-soft": "rgba(255, 255, 255, 0.05)",
      },
      fontFamily: {
        "display-lg": ["Inter", "sans-serif"],
        "body-base": ["Inter", "sans-serif"],
        "label-caps": ["JetBrains Mono", "monospace"],
        "headline-md": ["Inter", "sans-serif"],
        "code-sm": ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: [],
}
