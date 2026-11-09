/** Typed middleware provides validated data that routes map into their function's input. */
import { expect, test } from "vitest";
import { Hono } from "hono";
import { defineFunction } from "../../src/app/index.js";
import { invokeFunction, type InvocationTarget } from "../../src/engine/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { defineMiddleware, http } from "../../src/routes/index.js";
import { z } from "../../src/schema/index.js";
import { materializeRoutes, type RuntimeManifest } from "../../src/runtime-hono/materialize-routes";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes/orders/route.ts", line: 1, column: 1 } as const;
const tenant = defineMiddleware("/orders/*", {
  provides: z.object({ tenantId: z.string().min(1) }),
  handler: async (context, next, relkit) => {
    const tenantId = context.req.header("x-tenant");
    if (tenantId !== undefined) await relkit.provide({ tenantId });
    await next();
  },
});
// Plain Hono-style middleware keeps working next to typed middleware.
const poweredBy = defineMiddleware("*", async (context, next) => {
  await next();
  context.header("x-powered-by", "relkit");
});
const getOrder = defineFunction({
  id: "orders.get-order",
  input: z.object({ tenantId: z.string(), orderId: z.string() }),
  output: z.object({ tenantId: z.string(), orderId: z.string() }),
  handler: async (input) => input,
});
const request = http.input({
  tenantId: http.from(tenant, "tenantId"),
  orderId: http.path("orderId"),
});

function app() {
  const app = new Hono();
  materializeRoutes(app, {
    plan: {
      graphHash: "sha256:typed-middleware",
      functions: [],
      httpTriggers: [
        {
          kind: "trigger",
          id: "orders.get-order",
          source,
          triggerType: "http",
          targetFunctionId: "orders.get-order",
          config: {
            method: "GET",
            path: "/orders/:orderId",
            request,
            responses: [{ kind: "success", id: "ok", status: 200 }],
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
      middlewares: [
        { kind: "middleware", id: "powered-by", source, path: "*", order: 0 },
        { kind: "middleware", id: "tenant", source, path: "/orders/*", order: 1 },
      ],
    } as unknown as RegistrationPlan,
    manifest: {
      ...runtimeCohort("sha256:typed-middleware"),
      functions: {},
      middleware: { tenant, "powered-by": poweredBy },
      requestTransforms: {},
      routes: {},
    } satisfies RuntimeManifest,
    engine: {
      invoke: async (options) =>
        invokeFunction(getOrder as unknown as InvocationTarget, options.input, { source: "http" }),
    },
  });
  return app;
}

test("the function receives the tenant the middleware provided", async () => {
  const response = await app().request("/orders/o-1", { headers: { "x-tenant": "acme" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tenantId: "acme", orderId: "o-1" });
  expect(response.headers.get("x-powered-by")).toBe("relkit");
});

test("a request without provided data fails the function's input validation", async () => {
  const response = await app().request("/orders/o-1");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ code: "validation" });
});

test("data that does not match the provides schema fails the request", async () => {
  const response = await app().request("/orders/o-1", { headers: { "x-tenant": "" } });
  expect(response.status).toBe(500);
});

test("http.from records a middleware source the client never sends", () => {
  expect(http.from(tenant, "tenantId")).toEqual({ kind: "middleware", name: "tenantId" });
  // @ts-expect-error the tenant middleware provides no userId
  http.from(tenant, "userId");
});
