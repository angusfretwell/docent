import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [".agents/skills", "fixtures", ".dev"],
  sortTailwindcss: {
    functions: ["cva", "cn"],
    stylesheet: "./src/client/styles/index.css",
  },
});
