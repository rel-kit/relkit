/** Retains the original redaction runtime helpers and exact synthetic credential assertions. */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegistrationPlan } from "../../../packages/graph/src/index.ts";
import { type ObservabilityCollector } from "../../../packages/observability/src/index.ts";
import {
  createApp,
  type InternalEndpointOptions,
  type RuntimeManifest,
} from "../../../packages/runtime-hono/src/index.ts";
import { assertNoRawSyntheticSecrets } from "../../../scripts/secret-scan.ts";
import { runtimeCohort } from "../../integration/runtime-cohort.ts";
import { source, securityTraceId } from "./redaction-records.fixture.js";
export function createHttpRuntime(
  collector: ObservabilityCollector,
  internalEndpoints: InternalEndpointOptions = {},
) {
  return createApp({
    plan: {
      graphHash: "sha256:security",
      functions: [],
      httpTriggers: [
        {
          kind: "trigger",
          id: "security.route",
          source,
          triggerType: "http",
          targetFunctionId: "security.handler",
          config: {
            method: "POST",
            path: "/security",
            request: { kind: "input", fields: {} },
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
      ],
      queues: [],
      schedules: [],
      eventTriggers: [],
      buckets: [],
      caches: [],
      tools: [],
      agents: [],
      middlewares: [],
    } satisfies RegistrationPlan,
    manifest: {
      ...runtimeCohort("sha256:security"),
      functions: {},
      middleware: {},
      requestTransforms: {},
    } satisfies RuntimeManifest,
    generationId: "security-generation",
    observability: collector,
    internalEndpoints,
    middleware: { requestId: () => "security.request", traceId: () => securityTraceId },
    engine: { invoke: async () => ({ ok: true }) },
  });
}

export async function readTree(root: string): Promise<readonly string[]> {
  const values: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) values.push(await readFile(child, "utf8"));
    }
  }
  await visit(root);
  return values;
}

export function assertNoSecrets(label: string, value: unknown): void {
  assertNoRawSyntheticSecrets(label, value);
}
