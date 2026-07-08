import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Throwaway prototype for docent issue #4 (diff-rendering perf).
export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "esnext" },
});
