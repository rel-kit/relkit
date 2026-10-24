/** Verifies concrete native container/build source obligations while respecting optional agent wiring in a minimal graph. */
import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

const artifactPaths = [
  ".dockerignore",
  "Dockerfile",
  "application.graph.json",
  "manifest.json",
  "openapi.json",
  "server/index.js",
  "server/index.ts",
  "server/runtime-activation.json",
  "server/runtime-integrations.plan.json",
  "server/runtime.manifest.ts",
  "server/runtime-integrations.ts",
] as const;

/**
 * Reads all deterministic emitted artifacts without executing generated application code.
 * @param root - Test-owned build directory.
 * @returns Exact source/metadata bytes after all native reads settle.
 */
export function readBuildArtifacts(root: string): Promise<readonly string[]> {
  return Effect.runPromise(
    Effect.forEach(artifactPaths, (path) =>
      scaffoldNative("command.artifact.read", () => readFile(join(root, path), "utf8")),
    ),
  );
}

/**
 * Checks actual minimal build obligations without requiring optional model runtime imports.
 * @param artifacts - Ordered native artifact bytes from readBuildArtifacts.
 * @returns Completion or an assertion defect naming the missing obligation.
 */
export function assertBuildArtifacts(artifacts: readonly string[]): void {
  const docker = artifacts[1],
    ignore = artifacts[0],
    server = artifacts[6];
  expect(docker).toContain("FROM oven/bun:1.3.10");
  for (const text of ["USER bun", "STOPSIGNAL SIGTERM", "COPY server/ ./server/"])
    expect(docker).toContain(text);
  expect(docker).not.toContain("COPY .");
  expect(ignore).toContain(".env");
  expect(ignore).toContain(".relkit/state");
  for (const text of [
    "createObservabilityRuntime",
    "materializeEvents",
    "materializeJobs",
    "createJobsRuntime",
    "startNativeJobWorker",
    "RELKIT_LEGACY_JOBS_DISABLED",
    "formatHumanLog(record)",
    'source: request.source ?? "http"',
    "SIGTERM",
  ])
    expect(server).toContain(text);
  for (const text of [
    "RELKIT_TASK_RUNTIME_UNAVAILABLE",
    "invokeAgent",
    "@sentry/bun",
    "__relkit_flush_sentry",
  ])
    expect(server).not.toContain(text);
  expect(artifacts.at(-1)).toContain("runtimeIntegrationModules = []");
}
