import { defineConfig } from "oxlint";
import type { OxlintOverride } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

/**
 * One `no-restricted-imports` override forbidding a set of `src/` layers,
 * matched by alias and by relative path alike.
 * @see docs/adr/0002-src-layering.md
 */
function layerBoundary(
  files: string[],
  forbidden: string[],
  message: string
): OxlintOverride {
  const group = forbidden.flatMap((layer) => [
    `@${layer}/**`,
    `../${layer}/**`,
    `../../${layer}/**`,
  ]);
  return {
    files,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group, message }] }],
    },
  };
}

export default defineConfig({
  env: {
    builtin: true,
  },
  extends: [core, react, tanstack],
  ignorePatterns: [".agents/skills", "fixtures", ".dev"],
  options: {
    typeAware: true,
  },
  // Import edges point one way — docent.ts → cli → api → core → shared, with
  // client → shared and website → client → shared beside it
  // (docs/adr/0002-src-layering.md, docs/adr/0003-website-as-a-static-build-target.md).
  // Tests are exempt: an integration test may boot a higher layer to exercise
  // its subject.
  overrides: [
    layerBoundary(
      ["src/cli/**"],
      ["client", "website"],
      "cli never imports client: the client bundle reaches the binary only through src/docent.ts"
    ),
    layerBoundary(
      ["src/api/**"],
      ["cli", "client", "website"],
      "api sits below cli: it imports core and shared only"
    ),
    layerBoundary(
      ["src/core/**"],
      ["cli", "api", "client", "website"],
      "core is the bottom Bun-side layer: it imports shared only"
    ),
    layerBoundary(
      ["src/client/**"],
      ["cli", "api", "core", "website"],
      "client is browser-only: it imports shared only — core is Bun-side, and website is the surface built on top of it"
    ),
    layerBoundary(
      ["src/website/**"],
      ["cli", "api", "core"],
      "website is browser-only: it reuses client and shared code — the layers above are Bun-side"
    ),
    layerBoundary(
      ["src/shared/**"],
      ["cli", "api", "core", "client", "website"],
      "shared is isomorphic and browser-safe: it imports nothing above it"
    ),
    {
      files: ["**/*.test.ts"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
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
    "jsx-a11y/no-static-element-interactions": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "max-classes-per-file": "off",
    "no-await-in-loop": "off",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "react/jsx-no-constructed-context-values": "off",
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
