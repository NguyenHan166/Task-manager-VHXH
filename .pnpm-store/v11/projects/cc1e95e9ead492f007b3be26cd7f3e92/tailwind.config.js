/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
        },
        canvas: "#F7F9FB",
        surface: "#FFFFFF",
        "text-primary": "#0F172A",
        "text-secondary": "#475569",
        "text-muted": "#64748B",
        border: "#E2E8F0",
        info: "#2563EB",
        success: "#15803D",
        warning: "#B45309",
        danger: "#B91C1C",
        review: "#7C3AED",
        // status specifics
        status: {
          draft: "#475569",
          "draft-bg": "#F1F5F9",
          todo: "#1D4ED8",
          "todo-bg": "#DBEAFE",
          progress: "#B45309",
          "progress-bg": "#FEF3C7",
          review: "#7C3AED",
          "review-bg": "#F3E8FF",
          done: "#15803D",
          "done-bg": "#DCFCE7",
          cancelled: "#64748B",
          "cancelled-bg": "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: "14px",
        btn: "10px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(15,23,42,.04)",
      },
    },
  },
  plugins: [],
};
