/**
 * Ambient declarations for the client's bundler-resolved imports. Bun's
 * fullstack bundler injects `import "….css"` side-effect stylesheets at bundle
 * time, but ships no type for them — this fills the gap `vite/client` covered
 * before the Vite→Bun move.
 */

declare module "*.css";
