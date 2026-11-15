/**
 * The transport security the generated server registers admits a state-changing request without
 * `Origin` as a trusted service call outside production, and never when a browser's own headers
 * (`Referer`, `Sec-Fetch-Site`) show where the request came from.
 */
import { expect, test } from "bun:test";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "relkit/contracts";
import type { RegistrationPlan } from "relkit/graph";
import { createApp, type RuntimeManifest } from "relkit/runtime-hono";
import { SERVER_REGISTRATION_SOURCE } from "../../src/commands/build-server-registration.js";

const url = "http://localhost:3000/write";

/** Evaluates the generated registration source the way the generated server holds it. */
function registration(environment: string) {
  return new Function(
    "environment",
    `${SERVER_REGISTRATION_SOURCE}; return transportSecurityRegistration();`,
  )(environment) as NonNullable<Parameters<typeof createApp>[0]["transportSecurity"]>;
}

/** The status a state-changing request with these headers gets from the generated policy. */
async function post(environment: string, headers: Record<string, string>): Promise<number> {
  const plan = rawPlan();
  const app = createApp({
    plan,
    manifest: {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash: plan.graphHash,
      activationFingerprint: {
        graphHash: plan.graphHash,
        manifestHash: "sha256:test-manifest",
        runtimeIntegrationsPlanHash: "sha256:test-runtime-integrations",
      },
      runtimeIntegrationsPlan: {
        version: RUNTIME_INTEGRATION_PLAN_VERSION,
        fileName: RUNTIME_INTEGRATION_PLAN_FILE,
        graphHash: plan.graphHash,
      },
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: { "write.raw": { handler: () => Response.json({ ok: true }) } },
    } as unknown as RuntimeManifest,
    engine: { invoke: async () => undefined },
    transportSecurity: registration(environment),
  });
  return (await app.request(url, { method: "POST", headers })).status;
}

test("in development a request without browser headers is a service call", async () => {
  expect(await post("development", {})).toBe(200);
  expect(await post("development", { cookie: "relkit_visitor=1; relkit_csrf=1" })).toBe(200);
  expect(await post("test", {})).toBe(200);
});

test("in development a foreign Referer or a cross-site fetch is not a service call", async () => {
  const cookie = "relkit_visitor=1; relkit_csrf=1";
  expect(await post("development", { cookie, referer: "https://evil.example/form" })).toBe(403);
  expect(await post("development", { cookie, "sec-fetch-site": "cross-site" })).toBe(403);
  expect(await post("development", { cookie, referer: "http://localhost:3000/page" })).toBe(200);
});

test("in production no request without Origin is a service call", async () => {
  expect(await post("production", {})).toBe(403);
  expect(await post("production", { origin: "http://localhost:3000" })).toBe(200);
});

function rawPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:generated-trusted-service",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "write.raw",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "write.raw",
        config: {
          method: "POST",
          path: "/write",
          rawHandler: true,
          request: {},
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
    channels: [],
    middlewares: [],
  };
}
