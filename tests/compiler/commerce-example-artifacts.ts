/**
 * Asserts compiler artifact metadata and portable serialized graph content.
 * Foreign JSON is decoded before inspection; imports stay within the primary
 * application API while framework identity uses its narrow internal entrypoint.
 */
import { expect } from "bun:test";
import { Schema } from "effect";
import type { JsonValue } from "../../packages/contracts/src/index.ts";
import type { FixtureCompilation } from "./fixture-runner.ts";
import { CommerceLocalBindings, CommerceRuntimePackages } from "./commerce-example.schemas.ts";
import { assertGuardedRuntimeImports } from "./runtime-import-assertions.ts";

/**
 * Verifies all integration and local-service projections plus portable output.
 * @param run - Successful isolated compiler result.
 * @returns Completion when identities, data-only output and imports agree.
 */
export function assertCommerceArtifacts(run: FixtureCompilation): void {
  const local = Schema.decodeUnknownSync(CommerceLocalBindings)(
    JSON.parse(run.normalization.outputs.localServices),
  );
  expect(local.services.map((entry) => entry.bindingId)).toEqual([
    "provider.agent-state.agents",
    "provider.bucket.agent-workspace",
    "provider.bucket.assets",
    "provider.bucket.receipts",
    "provider.cache.requests",
    "provider.cache.timeline",
    "provider.job.default",
    "provider.realtime.default",
  ]);
  assertRuntimeIntegrations(run);
  expect(run.manifest).toContain('from "@relkit/app/internal/runtime";');
  expect(run.manifest).toContain('from "@relkit/app/agents";');
  expect(run.manifest).not.toMatch(/from "@relkit\/(?:agents|events|invocation)"/);
  expect(run.manifest).not.toContain("providerFactories");
  const graph = Schema.decodeUnknownSync(Schema.Json)(JSON.parse(run.graphBytes));
  assertPortableGraph(graph);
  expect(run.manifest).not.toContain("/Users/");
  expect(run.manifest).not.toContain("[Function");
}

/** Verifies native capability ownership without duplicating executable modules. */
function assertRuntimeIntegrations(run: FixtureCompilation): void {
  const runtime = Schema.decodeUnknownSync(CommerceRuntimePackages)(
    JSON.parse(run.normalization.outputs.runtimeIntegrations),
  );
  expect(
    runtime.integrations.map(({ capability, adapterId, packageName }) => [
      capability,
      adapterId,
      packageName,
    ]),
  ).toEqual([
    ["agent-deep", "deepagents", "@relkit/langchain"],
    ["agent-execution", "langchain", "@relkit/langchain"],
    ["agent-state", "redis-agent-state", "@relkit/redis"],
    ["bucket", "s3", "@relkit/s3"],
    ["cache", "redis", "@relkit/redis"],
    ["job", "inngest", "@relkit/inngest"],
    ["realtime", "redis-realtime", "@relkit/redis"],
    ["telemetry", "otlp", "@relkit/otlp"],
    ["telemetry", "sentry", "@relkit/sentry"],
  ]);
  assertGuardedRuntimeImports(
    run.normalization.outputs.runtimeIntegrationImports,
    runtime.integrations,
  );
}

/**
 * Checks portable source provenance recursively over schema-validated JSON.
 * @param value - Serialized graph value; no functions or native clients are admitted.
 * @param key - Owning JSON member name, preserved through array traversal.
 * @returns Completion when every source location is relative.
 */
function assertPortableGraph(value: JsonValue, key = ""): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertPortableGraph(entry, key);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (key === "source" && "file" in value && typeof value.file === "string")
    expect(/^(?:\/|[A-Za-z]:[\\/])/.test(value.file)).toBe(false);
  for (const [childKey, child] of Object.entries(value)) assertPortableGraph(child, childKey);
}
