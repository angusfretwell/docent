import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  env: {
    builtin: true,
  },
  extends: [core, react, tanstack, vitest],
  ignorePatterns: ["prototypes", ".agents"],
  options: {
    typeAware: true,
  },
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
    "max-classes-per-file": "off",
    "no-await-in-loop": "off",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "require-unicode-regexp": "off",
    // most of these should be turned back on
    "typescript/await-thenable": "off",
    "typescript/consistent-return": "off",
    "typescript/no-confusing-void-expression": "off",
    "typescript/no-floating-promises": "off",
    "typescript/no-misused-spread": "off",
    "typescript/no-unnecessary-boolean-literal-compare": "off",
    "typescript/no-unnecessary-type-assertion": "off",
    "typescript/no-unsafe-argument": "off",
    "typescript/no-unsafe-assignment": "off",
    "typescript/no-unsafe-call": "off",
    "typescript/no-unsafe-member-access": "off",
    "typescript/no-unsafe-return": "off",
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/non-nullable-type-assertion-style": "off",
    "typescript/prefer-nullish-coalescing": "off",
    "typescript/promise-function-async": "off",
    "typescript/require-array-sort-compare": "off",
    "typescript/restrict-template-expressions": "off",
    "typescript/return-await": "off",
    "typescript/strict-boolean-expressions": "off",
    "typescript/switch-exhaustiveness-check": "off",
    "typescript/use-unknown-in-catch-callback-variable": "off",
  },
});
