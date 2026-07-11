import path from "node:path";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: Infinity,
    emptyOutDir: true,
    outDir: path.resolve(import.meta.dirname, "dist/client"),
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  root: path.resolve(import.meta.dirname, "src/client"),
});
