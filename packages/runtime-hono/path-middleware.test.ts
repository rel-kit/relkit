import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { RegistrationPlan } from "@relkit/graph";
import { materializeRoutes, type RuntimeManifest } from "./src/materialize-routes";

const source = { file: "middleware.test.ts", line: 1, column: 1 } as const;

describe("path-scoped middleware", () => {
  test("uses native Hono onion order, validated request data, and response mutation", async () => {
    const calls: string[] = [];
    const app = new Hono();
    materializeRoutes(app, options(calls));
    const response = await app.request("/orders/42?name=raw");
    expect(await response.json()).toEqual({ name: "changed" });
    expect(response.headers.get("x-middleware")).toBe("done");
    expect(calls).toEqual([
      "global:before",
      "orders:before",
      "param:before",
      "function",
      "param:after",
      "orders:after",
      "global:after",
    ]);
  });

  test("short-circuits without invoking the route target", async () => {
    const calls: string[] = [];
    const app = new Hono();
    materializeRoutes(app, options(calls));
    const response = await app.request("/blocked/42");
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("blocked");
    expect(calls).not.toContain("function");
  });
});

function options(calls: string[]) {
  const middleware = {
    "a.global": descriptor("*", "global", calls),
    "b.orders": descriptor("/orders/*", "orders", calls, true),
    "c.param": descriptor("/orders/:id", "param", calls),
    "d.blocked": {
      path: "/blocked/*",
      handler: () => new Response("blocked", { status: 401 }),
    },
  };
  return {
    plan: plan(),
    manifest: {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash: "sha256:middleware",
      functions: {},
      middleware,
      requestTransforms: {},
    } satisfies RuntimeManifest,
    engine: {
      invoke: async ({ input }: { input: unknown }) => {
        calls.push("function");
        return input;
      },
    },
  };
}

function descriptor(path: string, name: string, calls: string[], transform = false) {
  return {
    path,
    handler: async (context: Context, next: () => Promise<void>) => {
      calls.push(`${name}:before`);
      if (transform) context.req.addValidatedData("query", { name: "changed" });
      await next();
      if (transform) context.header("x-middleware", "done");
      calls.push(`${name}:after`);
    },
  };
}

function plan(): RegistrationPlan {
  const middleware = [
    { kind: "middleware", id: "d.blocked", source, path: "/blocked/*", order: 3 },
    { kind: "middleware", id: "c.param", source, path: "/orders/:id", order: 2 },
    { kind: "middleware", id: "b.orders", source, path: "/orders/*", order: 1 },
    { kind: "middleware", id: "a.global", source, path: "*", order: 0 },
  ] as const;
  const route = (id: string, path: string) => ({
    kind: "trigger" as const,
    id,
    source,
    triggerType: "http" as const,
    targetFunctionId: "target",
    config: {
      method: "GET",
      path,
      request: { kind: "input", fields: { name: { kind: "query", name: "name" } } },
      responses: [{ kind: "success", id: "ok", status: 200 }],
      middleware: [],
      transforms: [],
    },
  });
  return {
    graphHash: "sha256:middleware",
    functions: [],
    httpTriggers: [route("orders", "/orders/:id"), route("blocked", "/blocked/:id")],
    queues: [],
    schedules: [],
    eventTriggers: [],
    events: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    services: [],
    middlewares: middleware,
  };
}
