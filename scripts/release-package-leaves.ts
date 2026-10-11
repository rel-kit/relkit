/**
 * Lists intentional package leaves checked before release and packed smoke tests.
 * Conditions preserve existing native adapters and add prepared-development
 * boundaries without exporting unrelated source or acquiring runtime resources.
 */
import type { ReleaseExports } from "./release-package-contract.types.js";

/** Declared leaves supplement each package's standard root export. */
export const packageLeafExports: Readonly<Record<string, ReleaseExports>> = {
  "create-relkit": {
    "./catalog-resolution": {
      types: "./src/catalog-resolution.ts",
      default: "./src/catalog-resolution.ts",
    },
  },
  "cloud-aws": { "./runtime": esm("runtime/index") },
  contracts: { "./operation": esm("operation"), "./jobs": esm("jobs") },
  "runtime-effect": { "./logger": esm("logger") },
  events: { "./effect": esm("effect") },
  jobs: { "./adapter": esm("adapter"), "./server": esm("server"), "./legacy": esm("legacy") },
  cli: {
    "./help": esm("cli-help-model"),
    "./editor": { types: "./dist/editor.d.ts", require: "./dist/editor.cjs" },
    "./internal/tooling": esm("internal/tooling"),
    "./internal/server-runtime": {
      types: "./dist/internal/server-runtime.d.ts",
      default: "./dist/internal/server-runtime.js",
    },
  },
  compiler: { "./editor": esm("editor") },
  config: { "./internal/config": esm("internal/config") },
  drizzle: { "./internal": esm("internal") },
  functions: { "./internal": esm("internal") },
  client: {
    "./server": { types: "./dist/server.d.ts", bun: "./dist/server.js" },
    "./tanstack-query": esm("tanstack-query"),
    "./react": esm("react/index"),
    "./jobs": esm("jobs/index"),
    "./build/next": { ...esm("build/next"), default: "./dist/build/next.js" },
    "./build/vite": { ...esm("build/vite"), default: "./dist/build/vite.js" },
  },
  "better-auth": { "./react": esm("react") },
  realtime: { "./operation-id": esm("operation-id") },
  "runtime-hono": { "./internal/prepared": esm("prepared-app"), "./bun": esm("bun") },
  agents: {
    "./client-events": esm("client-events"),
    "./continuation-validation": esm("continuation-validation"),
  },
  observability: {
    "./telemetry": esm("telemetry"),
    "./local": esm("local/index"),
    "./early": esm("early-records.service"),
    "./local/record": esm("local/types"),
    "./local/worker": esm("local/worker"),
    "./local/queue": esm("local/batch-queue-effect"),
    "./internal/local-worker": esm("local/duckdb-worker"),
  },
};

/**
 * Specifies the exact declaration and ESM file for a package leaf.
 * @param path - Intentional dist module stem.
 * @returns Pure export conditions; existence is checked by packed validation.
 */
function esm(path: string) {
  return { types: `./dist/${path}.d.ts`, import: `./dist/${path}.js` };
}
