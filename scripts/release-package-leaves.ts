/**
 * Lists intentional package leaves checked before release and packed smoke tests.
 * Conditions preserve existing native adapters and add prepared-development
 * boundaries without exporting unrelated source or acquiring runtime resources.
 */
import type { ReleaseExports } from "./release-package-contract.types.js";

/** Declared leaves supplement each package's standard root export. */
export const packageLeafExports: Readonly<Record<string, ReleaseExports>> = {
  "create-relkit": {
    "./cli": esm("cli"),
    "./launcher": esm("launcher"),
    "./internal/add-transaction-files": esm("add-transaction-files"),
    "./internal/add-types": esm("add-types"),
    "./internal/build-catalog": esm("build-catalog"),
    "./internal/catalog-resolution": esm("catalog-resolution"),
    "./internal/dependency-patch-installation": esm("dependency-patch-installation"),
    "./internal/dependency-patches": esm("dependency-patches"),
    "./internal/generate": esm("generate"),
    "./internal/generate-process": esm("generate-process"),
    "./internal/generator-cleanup": esm("generator-cleanup"),
    "./internal/generator-errors": esm("generator-errors"),
    "./internal/generator-filesystem": esm("generator-filesystem"),
    "./internal/generator-filesystem.types": esm("generator-filesystem.types"),
    "./internal/generator-paths": esm("generator-paths"),
    "./internal/generator-process": esm("generator-process"),
    "./internal/generator-process.types": esm("generator-process.types"),
    "./internal/generator-prompt": esm("generator-prompt"),
    "./internal/generator-runtime": esm("generator-runtime"),
    "./internal/options": esm("options"),
    "./internal/project-manifest.schemas": esm("project-manifest.schemas"),
    "./internal/prompt-driver": esm("prompt-driver"),
    "./internal/prompt-driver.types": esm("prompt-driver.types"),
    "./internal/scaffold-catalog": esm("scaffold-catalog"),
    "./internal/scaffold-catalog.types": esm("scaffold-catalog.types"),
    "./internal/validate-paths": esm("validate-paths"),
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
    "./scaffolding": esm("scaffolding/index"),
    "./help": esm("cli-help-model"),
    "./editor": { types: "./dist/editor.d.ts", require: "./dist/editor.cjs" },
    "./internal/tooling": esm("internal/tooling"),
  },
  compiler: { "./editor": esm("editor") },
  engine: { "./internal/server-runtime": esm("internal/server-runtime") },
  provider: { "./internal/dependencies": esm("dependency-preflight.service") },
  config: { "./internal/config": esm("internal/config") },
  drizzle: {
    "./internal": esm("internal"),
    "./sqlite": esm("sqlite"),
    "./pg": esm("pg"),
    "./mysql": esm("mysql"),
  },
  functions: { "./internal": esm("internal") },
  client: {
    "./server/tanstack-query": {
      types: "./dist/server-context.d.ts",
      bun: "./dist/server-context.js",
    },
    "./server": { types: "./dist/server.d.ts", bun: "./dist/server.js" },
    "./tanstack-query": esm("tanstack-query"),
    "./react": esm("react/index"),
    "./jobs": esm("jobs/index"),
    "./build/next": { ...esm("build/next"), default: "./dist/build/next.js" },
    "./build/vite": { ...esm("build/vite"), default: "./dist/build/vite.js" },
  },
  "better-auth": { "./react": esm("react"), "./drizzle": esm("drizzle") },
  realtime: { "./operation-id": esm("operation-id") },
  "runtime-hono": {
    "./internal/prepared": esm("prepared-app"),
    "./bun": esm("bun"),
    "./mcp": esm("mcp"),
    "./ag-ui": esm("agent-protocol"),
    "./scalar": esm("scalar"),
  },
  agents: {
    "./client-events": esm("client-events"),
    "./internal/agent-client": esm("agent-client"),
    "./internal/agent-telemetry": esm("agent-telemetry"),
    "./internal/agent-validation": esm("agent-validation"),
    "./internal/agent-validation-schema": esm("agent-validation-schema"),
    "./internal/agent-validation-value": esm("agent-validation-value"),
    "./internal/approval": esm("approval"),
    "./internal/capture": esm("capture"),
    "./internal/capture-policy": esm("capture-policy"),
    "./internal/client-contract-schema.types": esm("client-contract-schema.types"),
    "./internal/client-events": esm("client-events"),
    "./internal/define-agent-error": esm("define-agent-error"),
    "./internal/define-agent-limits": esm("define-agent-limits"),
    "./internal/define-agent-support": esm("define-agent-support"),
    "./internal/generated-function": esm("generated-function"),
    "./internal/model-selection": esm("model-selection"),
    "./internal/observability": esm("observability"),
    "./internal/runtime-events": esm("runtime-events"),
    "./internal/state-control-requests.types": esm("state-control-requests.types"),
    "./internal/state-provider.types": esm("state-provider.types"),
    "./internal/state-receipts.types": esm("state-receipts.types"),
    "./internal/state-thread-requests.types": esm("state-thread-requests.types"),
    "./internal/state.types": esm("state.types"),
    "./internal/thread-transition": esm("thread-transition"),
  },
  langchain: {
    "./runtime": esm("runtime"),
    "./continuation-validation": esm("continuation-validation"),
    "./testing": esm("testing/agents"),
  },
  testing: {
    "./internal/fakes": esm("fakes"),
    "./internal/jobs-utils": esm("jobs-utils"),
    "./internal/runtime-clock": esm("runtime-clock"),
    "./internal/testing-owner": esm("testing-owner"),
    "./internal/work-ownership": esm("work-ownership"),
    "./drizzle": esm("drizzle"),
    "./better-auth": esm("better-auth"),
  },
  "observability-local": {
    "./worker": esm("local/worker"),
    "./internal/local-worker": esm("local/duckdb-worker"),
  },
  observability: {
    "./telemetry": esm("telemetry"),
    "./local": esm("local/index"),
    "./early": esm("early-records.service"),
    "./local/record": esm("local/types"),
    "./local/worker-contract": esm("local/worker-contract"),
    "./internal/query": esm("query-validation"),
    "./local/queue": esm("local/batch-queue-effect"),
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
