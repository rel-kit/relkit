import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { HttpTriggerRegistration, RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest } from "./src/index.ts";

const source = { file: "src/routes/docs/[[...parts]]/route.ts", line: 1, column: 14 };

describe("catch-all and method runtime behavior", () => {
  test("registers optional variants and preserves independently encoded segments", async () => {
    const inputs: unknown[] = [];
    const app = createApp({
      plan: plan(optionalCatchAll()),
      manifest: manifest(),
      engine: {
        invoke: async ({ input }) => {
          inputs.push(input);
          return { ok: true };
        },
      },
    });

    expect((await app.request("http://localhost/docs")).status).toBe(200);
    expect((await app.request("http://localhost/docs/a%2Fb/c%20d")).status).toBe(200);
    expect(inputs).toEqual([{ parts: undefined }, { parts: ["a/b", "c d"] }]);
  });

  test("runs HEAD targets but removes their response body", async () => {
    let calls = 0;
    const trigger = {
      ...optionalCatchAll(),
      id: "health.head",
      config: {
        ...optionalCatchAll().config,
        method: "HEAD",
        path: "/health",
        runtimePaths: ["/health"],
        request: { kind: "input", fields: {} },
      },
    };
    const app = createApp({
      plan: plan(trigger),
      manifest: manifest(),
      engine: { invoke: async () => (calls++, { ok: true }) },
    });
    const response = await app.request("http://localhost/health", { method: "HEAD" });

    expect(calls).toBe(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("prefers an explicit HEAD export over Hono's GET fallback", async () => {
    const calls: string[] = [];
    const get = { ...optionalCatchAll(), id: "health.get", targetFunctionId: "health.get" };
    const head = {
      ...get,
      id: "health.head",
      targetFunctionId: "health.head",
      config: { ...get.config, method: "HEAD" },
    };
    const app = createApp({
      plan: plan(get, head),
      manifest: manifest(),
      engine: { invoke: async ({ functionId }) => (calls.push(functionId), { ok: true }) },
    });

    expect((await app.request("http://localhost/docs", { method: "HEAD" })).status).toBe(200);
    expect(calls).toEqual(["health.head"]);
  });
});

function optionalCatchAll(): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id: "docs.read",
    source,
    triggerType: "http",
    targetFunctionId: "docs.read",
    config: {
      method: "GET",
      path: "/docs/*parts?",
      runtimePaths: ["/docs", "/docs/:parts{.+}"],
      request: {
        kind: "input",
        fields: {
          parts: { kind: "optional", value: { kind: "path-segments", name: "parts" } },
        },
      },
      responses: [{ kind: "success", id: "success.200", status: 200 }],
      middleware: [],
      transforms: [],
    },
  };
}

function plan(...triggers: readonly HttpTriggerRegistration[]): RegistrationPlan {
  return {
    graphHash: "sha256:catch-all",
    functions: [],
    httpTriggers: triggers,
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
    graphHash: "sha256:catch-all",
    functions: {},
    middleware: {},
    requestTransforms: {},
  };
}
