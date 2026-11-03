/** Requires a route's `response` option to set the status, headers and cookies from the output. */
import { expect, test } from "vitest";
import type { HttpTriggerRegistration, RegistrationPlan } from "../../src/graph/index.js";
import { createApp, type RuntimeManifest } from "../../src/runtime-hono/index.js";
import { applyRouteResponse } from "../../src/routes/index.js";
import { runtimeCohort } from "./test-cohort.ts";

const source = { file: "src/routes/orders/route.ts", line: 1, column: 1 } as const;

function route(id: string, method: string, path: string): HttpTriggerRegistration {
  return {
    kind: "trigger",
    id,
    source,
    triggerType: "http",
    targetFunctionId: "orders.create",
    config: {
      method,
      path,
      request: { kind: "input", fields: {} },
      responses: [{ kind: "success", id: "success.200", status: 200 }],
      middleware: [],
      transforms: [],
    },
  } as HttpTriggerRegistration;
}

function plan(): RegistrationPlan {
  return {
    graphHash: "sha256:route-response",
    functions: [],
    httpTriggers: [
      route("orders.post", "POST", "/orders"),
      route("orders.plain", "PUT", "/orders"),
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
  } as RegistrationPlan;
}

function manifest(response: (output: { orderId: string }) => unknown): RuntimeManifest {
  return {
    ...runtimeCohort("sha256:route-response"),
    functions: {},
    middleware: {},
    requestTransforms: {},
    routes: { "orders.post": { response } },
  };
}

function app(response: (output: { orderId: string }) => unknown) {
  return createApp({
    plan: plan(),
    manifest: manifest(response),
    engine: { invoke: async () => ({ orderId: "order-1" }) },
  });
}

test("a route sets status, Location and cookies from the function's output", async () => {
  const created = await app((order) => ({
    status: 201,
    headers: { location: `/orders/${order.orderId}` },
    cookies: [
      { name: "last-order", value: order.orderId, path: "/", httpOnly: true, sameSite: "Lax" },
    ],
  })).request("http://localhost/orders", { method: "POST" });

  expect(created.status).toBe(201);
  expect(created.headers.get("location")).toBe("/orders/order-1");
  expect(created.headers.get("set-cookie")).toBe(
    "last-order=order-1; Path=/; HttpOnly; SameSite=Lax",
  );
  expect(created.headers.get("content-type")).toContain("application/json");
  expect(await created.json()).toEqual({ orderId: "order-1" });
});

test("only the route that declares the option changes its response", async () => {
  const plain = await app(() => ({ status: 201 })).request("http://localhost/orders", {
    method: "PUT",
  });
  expect(plain.status).toBe(200);
  expect(plain.headers.has("location")).toBe(false);
});

test("an invalid response option is a 500 problem, not a partial response", async () => {
  const invalid = await app(() => ({ status: 302 })).request("http://localhost/orders", {
    method: "POST",
  });
  expect(invalid.status).toBe(500);
  expect(invalid.headers.get("content-type")).toBe("application/problem+json");
  expect(await invalid.json()).toMatchObject({ code: "internal-error" });

  const thrown = await app(() => {
    throw new Error("broken");
  }).request("http://localhost/orders", { method: "POST" });
  expect(thrown.status).toBe(500);
});

test("a 204 status drops the body", async () => {
  const response = applyRouteResponse(Response.json({ ok: true }), { status: 204 });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});
