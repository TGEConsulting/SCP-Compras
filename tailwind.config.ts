import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta sobria: azul lácteo + verde de confirmación
        brand: { 50: "#eef6fb", 100: "#d6e9f5", 500: "#1f6fa8", 600: "#185a88", 700: "#134868" },
      },
    },
  },
  plugins: [],
};
export default config;
