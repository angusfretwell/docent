import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Throwaway prototype for docent issue #4 (diff-rendering perf).
export default defineConfig({
  build: { target: "esnext" },
  plugins: [react()],
  worker: { format: "es" },
});
