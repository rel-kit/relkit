import { expect, test } from "bun:test";
import { AGENT_CAPABILITY_HEADER } from "@relkit/contracts";
import type { RegistrationPlan } from "@relkit/graph";
import { assertWebSocketOrigin, createApp } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

test("state-changing routes reject bad origins and require cross-origin CSRF", async () => {
  let executions = 0;
  const plan = rawPlan();
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      routes: {
        "write.raw": {
          handler: () => {
            executions += 1;
            return Response.json({ ok: true });
          },
        },
      },
    },
    engine: { invoke: async () => undefined },
    transportSecurity: {
      allowedOrigins: ["https://app.example", "https://admin.example"],
      validateCsrf: (_request, token) => token === "valid",
    },
  });
  expect((await app.request("https://app.example/write", { method: "POST" })).status).toBe(403);
  expect(
    (
      await app.request("https://app.example/write", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      })
    ).status,
  ).toBe(403);
  expect(executions).toBe(0);

  const sameOrigin = await app.request("https://app.example/write", {
    method: "POST",
    headers: { origin: "https://app.example" },
  });
  expect(sameOrigin.status).toBe(200);
  const crossOrigin = await app.request("https://app.example/write", {
    method: "POST",
    headers: { origin: "https://admin.example", "x-relkit-csrf": "valid" },
  });
  expect(crossOrigin.status).toBe(200);
  expect(crossOrigin.headers.get("access-control-allow-origin")).toBe("https://admin.example");
  expect(crossOrigin.headers.get("access-control-allow-credentials")).toBe("true");
  expect(executions).toBe(2);
});

test("credentialed CORS rejects wildcards and WebSockets require an exact Origin", () => {
  expect(() =>
    createApp({
      plan: rawPlan(),
      manifest: manifest(rawPlan()),
      engine: { invoke: async () => undefined },
      transportSecurity: { allowedOrigins: ["*"] },
    }),
  ).toThrow("wildcard");
  const policy = { allowedOrigins: ["https://app.example"] };
  expect(() => assertWebSocketOrigin(new Request("https://api.example/ws"), policy)).toThrow();
  expect(() =>
    assertWebSocketOrigin(
      new Request("https://api.example/ws", { headers: { origin: "null" } }),
      policy,
    ),
  ).toThrow();
  expect(() =>
    assertWebSocketOrigin(
      new Request("https://api.example/ws", { headers: { origin: "https://app.example" } }),
      policy,
    ),
  ).not.toThrow();
});

test("preflight rejects undeclared methods and headers", async () => {
  const plan = rawPlan();
  const app = createApp({
    plan,
    manifest: manifest(plan),
    engine: { invoke: async () => undefined },
    transportSecurity: { allowedOrigins: ["https://app.example"] },
  });
  const rejected = await app.request("https://api.example/write", {
    method: "OPTIONS",
    headers: {
      origin: "https://app.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "x-not-declared",
    },
  });
  expect(rejected.status).toBe(403);

  const negotiated = await app.request("https://api.example/rpc", {
    method: "OPTIONS",
    headers: {
      origin: "https://app.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": AGENT_CAPABILITY_HEADER,
    },
  });
  expect(negotiated.status).toBe(204);
  expect(negotiated.headers.get("access-control-allow-headers")).toBe(AGENT_CAPABILITY_HEADER);
});

function rawPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:security",
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
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan) {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    middleware: {},
    requestTransforms: {},
    routes: { "write.raw": { handler: () => Response.json({ ok: true }) } },
  };
}
