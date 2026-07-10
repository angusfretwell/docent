import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: path.resolve(import.meta.dirname, "dist/client"),
  },
  plugins: [react()],
  root: path.resolve(import.meta.dirname, "src/client"),
});
