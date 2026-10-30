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
        canvas: "#F4F7FE",
        surface: "#FFFFFF",
        "text-primary": "#111827",
        "text-secondary": "#6B7280",
        "text-muted": "#959CA9",
        border: "#E5E7EB",
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
        sans: ['"Be Vietnam"', 'sans-serif'],
      },
      borderRadius: {
        card: "16px",
        btn: "6px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
