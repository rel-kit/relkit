/**
 * Supplies one checked route/document cohort and explicitly selects Scalar for
 * existing UI contract tests. JSON-only tests continue to use the core factory.
 */
import type { RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest, type ApiDocsOptions } from "../src/index.js";
import { scalarReference } from "../src/scalar.js";
import { runtimeCohort } from "./test-cohort.js";

export const source = { file: "src/routes/hello/route.ts", line: 1, column: 1 } as const;
export const plan: RegistrationPlan = {
  graphHash: "sha256:api-docs",
  functions: [
    {
      kind: "function",
      invocationMode: "callable",
      id: "hello",
      serviceId: "hello-service",
      source,
      input: { type: "object", properties: {} },
      output: { type: "object", properties: { ok: { type: "boolean" } } },
    },
  ],
  httpTriggers: [
    {
      kind: "trigger",
      id: "hello.http",
      source,
      triggerType: "http",
      targetFunctionId: "hello",
      serviceId: "hello-service",
      config: {
        method: "GET",
        path: "/hello",
        request: { kind: "input", fields: {} },
        responses: [{ kind: "success", id: "success.200", status: 200 }],
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
  channels: [],
  middlewares: [],
  services: [
    {
      kind: "service",
      id: "hello-service",
      source,
      title: "Hello",
      description: "Hello operations",
      tags: ["hello"],
      functions: [{ name: "hello", functionId: "hello" }],
      events: [],
    },
  ],
};
export const manifest: RuntimeManifest = {
  ...runtimeCohort(plan.graphHash),
  functions: {},
  middleware: {},
  requestTransforms: {},
};

/** Explicitly selects Scalar while preserving the shared route and exposure policy.
 * @param apiDocs - Document generation and authorization overrides.
 * @returns Synchronously constructed Hono application with the native UI installed.
 */
export function app(apiDocs: ApiDocsOptions = {}) {
  return createApp({
    plan,
    manifest,
    engine: { invoke: async () => ({ ok: true }) },
    apiDocs: { ui: "scalar", reference: scalarReference, ...apiDocs },
  });
}
