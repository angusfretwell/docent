import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import jsPlugins from "ultracite/oxlint/js-plugins";

export default defineConfig({
  env: {
    builtin: true,
  },
  extends: [core, react, tanstack, jsPlugins],
  ignorePatterns: ["prototypes", ".agents", ".sandcastle"],
  plugins: [
    "eslint",
    "import",
    "jsdoc",
    "jsx-a11y",
    "node",
    "oxc",
    "promise",
    "react-perf",
    "react",
    "typescript",
    "unicorn",
  ],
  rules: {
    "class-methods-use-this": "off",
    "func-style": ["error", "declaration"],
    "github/no-then": "off",
    "max-classes-per-file": "off",
    "no-await-in-loop": "off",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "require-unicode-regexp": "off",
  },
});
