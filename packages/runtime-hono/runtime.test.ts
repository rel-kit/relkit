import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import { createApp, materializeRoutes, type RuntimeManifest } from "./src/index.js";
import type { RegistrationPlan } from "@relkit/graph";

const source = { file: "src/app.ts", line: 1, column: 1 };

function plan(withRefs = true): RegistrationPlan {
  return {
    graphHash: "sha256:test",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "hello.route",
        source,
        triggerType: "http",
        targetFunctionId: "hello",
        config: {
          method: "GET",
          path: "/hello",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: withRefs ? [{ id: "name", schema: {} }] : [],
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
  };
}

function manifest(): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: "sha256:test",
    activationFingerprint: {
      graphHash: "sha256:test",
      manifestHash: "sha256:manifest",
      runtimeIntegrationsPlanHash: "sha256:runtime-integrations",
    },
    runtimeIntegrationsPlan: {
      version: RUNTIME_INTEGRATION_PLAN_VERSION,
      fileName: RUNTIME_INTEGRATION_PLAN_FILE,
      graphHash: "sha256:test",
    },
    functions: {},
    middleware: {},
    requestTransforms: { name: {} },
  };
}

test("materializes planned routes after manifest reference checks", async () => {
  const calls: unknown[] = [];
  const events: string[] = [];
  const app = createApp({
    plan: plan(),
    manifest: manifest(),
    engine: {
      invoke: async (options) => {
        calls.push(options);
        return { ok: true };
      },
    },
    frameworkMiddleware: [
      ...(["request-record", "limits", "trace", "request-id"] as const).map((name) => ({
        name,
        handler: (async (_context, next) => {
          events.push(name);
          return next();
        }) as MiddlewareHandler,
      })),
    ],
    mapInput: (_request, _trigger, targetFunctionId) => targetFunctionId,
  });

  const response = await app.request("http://localhost/hello");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(events).toEqual(["request-id", "trace", "limits", "request-record"]);
  expect(calls).toEqual([
    expect.objectContaining({ functionId: "hello", input: "hello", source: "http" }),
  ]);
});

test("rejects missing transform before adding any route", () => {
  const app = new Hono();
  const broken = { ...manifest(), requestTransforms: {} };
  expect(() =>
    materializeRoutes(app, {
      plan: plan(),
      manifest: broken,
      engine: { invoke: async () => undefined },
    }),
  ).toThrowError(
    expect.objectContaining({
      code: "RELKIT_MANIFEST_TRANSFORM_MISSING",
    }),
  );
  expect(app.routes).toHaveLength(0);
});

test("rejects a stale or missing runtime-integration plan before adding routes", () => {
  for (const [broken, code] of [
    [{ runtimeIntegrationsPlan: undefined }, "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED"],
    [
      {
        runtimeIntegrationsPlan: {
          ...manifest().runtimeIntegrationsPlan,
          version: RUNTIME_INTEGRATION_PLAN_VERSION - 1,
        },
      },
      "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED",
    ],
    [
      { runtimeIntegrationsPlan: { ...manifest().runtimeIntegrationsPlan, graphHash: "stale" } },
      "RELKIT_RUNTIME_INTEGRATION_PLAN_REFERENCE_INVALID",
    ],
    [
      { activationFingerprint: { ...manifest().activationFingerprint, graphHash: "stale" } },
      "RELKIT_RUNTIME_ACTIVATION_FINGERPRINT_INVALID",
    ],
  ] as const) {
    expect(() =>
      materializeRoutes(new Hono(), {
        plan: plan(),
        manifest: { ...manifest(), ...broken } as unknown as RuntimeManifest,
        engine: { invoke: async () => undefined },
      }),
    ).toThrowError(
      expect.objectContaining({
        code,
        message: expect.stringContaining("Rebuild with `relkit build`"),
      }),
    );
  }
});
