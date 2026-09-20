/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0E17",
        panel: "#121826",
        panel2: "#171F30",
        line: "#232838",
        scan: "#00D9C0",
        signal: "#FFB84D",
        text: "#E8ECF1",
        muted: "#7A8699",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        sweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        ping: {
          "0%": { transform: "scale(1)", opacity: 1 },
          "75%, 100%": { transform: "scale(2.2)", opacity: 0 },
        },
      },
      animation: {
        sweep: "sweep 6s linear infinite",
        blip: "ping 2.5s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};
