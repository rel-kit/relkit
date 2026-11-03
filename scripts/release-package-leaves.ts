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
    "./add-transaction-files": esm("add-transaction-files"),
    "./add-types": esm("add-types"),
    "./build-catalog": esm("build-catalog"),
    "./dependency-patch-installation": esm("dependency-patch-installation"),
    "./dependency-patches": esm("dependency-patches"),
    "./generate": esm("generate"),
    "./generate-process": esm("generate-process"),
    "./generator-cleanup": esm("generator-cleanup"),
    "./generator-errors": esm("generator-errors"),
    "./generator-filesystem": esm("generator-filesystem"),
    "./generator-filesystem.types": esm("generator-filesystem.types"),
    "./generator-paths": esm("generator-paths"),
    "./generator-process": esm("generator-process"),
    "./generator-process.types": esm("generator-process.types"),
    "./generator-prompt": esm("generator-prompt"),
    "./generator-runtime": esm("generator-runtime"),
    "./options": esm("options"),
    "./project-manifest.schemas": esm("project-manifest.schemas"),
    "./prompt-driver": esm("prompt-driver"),
    "./prompt-driver.types": esm("prompt-driver.types"),
    "./scaffold-catalog": esm("scaffold-catalog"),
    "./scaffold-catalog.types": esm("scaffold-catalog.types"),
    "./validate-paths": esm("validate-paths"),
    "./catalog-resolution": {
      types: "./src/catalog-resolution.ts",
      default: "./src/catalog-resolution.ts",
    },
  },
  "cloud-aws": { "./runtime": esm("runtime/index") },
  contracts: { "./operation": esm("operation"), "./jobs": esm("jobs") },
  "runtime-effect": { "./logger": esm("logger") },
  "inspector-api": { "./connection": esm("connection") },
  events: { "./effect": esm("effect") },
  jobs: { "./adapter": esm("adapter"), "./server": esm("server"), "./legacy": esm("legacy") },
  cli: {
    "./scaffolding": esm("scaffolding/index"),
    "./help": esm("cli-help-model"),
    "./editor": { types: "./dist/editor.d.ts", require: "./dist/editor.cjs" },
    "./tooling": esm("tooling"),
  },
  compiler: { "./editor": esm("editor") },
  diagnostics: { "./codes": esm("codes/index") },
  engine: { "./server-runtime": esm("server-runtime") },
  provider: { "./dependencies": esm("dependency-preflight.service") },
  config: { "./resolution": esm("resolution") },
  drizzle: {
    "./server": esm("server"),
    "./sqlite": esm("sqlite"),
    "./pg": esm("pg"),
    "./mysql": esm("mysql"),
  },
  functions: { "./descriptor-factory": esm("descriptor-factory") },
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
    "./prepared": esm("prepared-app"),
    "./bun": esm("bun"),
    "./mcp": esm("mcp"),
    "./ag-ui": esm("agent-protocol"),
    "./scalar": esm("scalar"),
  },
  agents: {
    "./client-events": esm("client-events"),
    "./agent-client": esm("agent-client"),
    "./agent-telemetry": esm("agent-telemetry"),
    "./agent-validation": esm("agent-validation"),
    "./agent-validation-schema": esm("agent-validation-schema"),
    "./agent-validation-value": esm("agent-validation-value"),
    "./approval": esm("approval"),
    "./capture": esm("capture"),
    "./capture-policy": esm("capture-policy"),
    "./client-contract-schema.types": esm("client-contract-schema.types"),
    "./define-agent-error": esm("define-agent-error"),
    "./define-agent-limits": esm("define-agent-limits"),
    "./define-agent-support": esm("define-agent-support"),
    "./generated-function": esm("generated-function"),
    "./model-selection": esm("model-selection"),
    "./observability": esm("observability"),
    "./runtime-events": esm("runtime-events"),
    "./state-control-requests.types": esm("state-control-requests.types"),
    "./state-provider.types": esm("state-provider.types"),
    "./state-receipts.types": esm("state-receipts.types"),
    "./state-thread-requests.types": esm("state-thread-requests.types"),
    "./state.types": esm("state.types"),
    "./thread-transition": esm("thread-transition"),
  },
  langchain: {
    "./runtime": esm("runtime"),
    "./continuation-validation": esm("continuation-validation"),
    "./testing": esm("testing/agents"),
  },
  testing: {
    "./fakes": esm("fakes"),
    "./jobs-utils": esm("jobs-utils"),
    "./runtime-clock": esm("runtime-clock"),
    "./testing-owner": esm("testing-owner"),
    "./work-ownership": esm("work-ownership"),
    "./drizzle": esm("drizzle"),
    "./better-auth": esm("better-auth"),
  },
  "observability-local": {
    "./worker": esm("local/worker"),
  },
  observability: {
    "./telemetry": esm("telemetry"),
    "./local": esm("local/index"),
    "./early": esm("early-records.service"),
    "./local/record": esm("local/types"),
    "./local/worker-contract": esm("local/worker-contract"),
    "./local/protocol": esm("local/protocol"),
    "./query": esm("query-validation"),
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
