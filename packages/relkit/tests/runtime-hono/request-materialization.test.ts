import { describe, expect, test } from "vitest";
import { defineFunction } from "../../src/app/index.js";
import { invokeFunction, type InvocationTarget } from "../../src/engine/index.js";
import type { RegistrationPlan } from "../../src/graph/index.js";
import { z } from "../../src/schema/index.js";
import { createApp } from "../../src/runtime-hono/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

describe("framework-neutral HTTP request materialization", () => {
  test("keeps params, repeated values, and headers inside HTTP input mapping", async () => {
    let mapped: import("../../src/runtime-hono/index.ts").HttpRouteRequest | undefined;
    const plan = routePlan();
    const app = createApp({
      plan,
      manifest: {
        ...runtimeCohort(plan.graphHash),
        functions: {},
        middleware: {},
        requestTransforms: {},
      },
      middleware: {
        requestId: () => "request.test",
        traceId: () => "trace.test",
      },
      mapInput: (request) => {
        mapped = request;
        return {};
      },
      engine: {
        invoke: async () => ({ ok: true }),
      },
    });

    const response = await app.request(
      "http://localhost/orders/order-1/products/product-2?tag=red&tag=blue",
      { headers: { "x-tags": "one, two" } },
    );

    expect(response.status).toBe(200);
    expect(mapped?.params).toEqual({ orderId: "order-1", productId: "product-2" });
    expect(mapped?.query).toEqual({ tag: ["red", "blue"] });
    expect(mapped?.headers["x-tags"]).toEqual(["one", "two"]);
    expect(mapped?.pathPattern).toBe("/orders/:orderId/products/:productId");
    expect(Object.isFrozen(mapped?.params)).toBe(true);
    expect(Object.isFrozen(mapped?.query)).toBe(true);
  });
});

describe("inferred input decoding", () => {
  const target = defineFunction({
    id: "orders.reserve",
    input: z.object({ quantity: z.number().int(), limit: z.number().int() }),
    output: z.object({ quantity: z.number(), limit: z.number() }),
    handler: async (input) => input,
  });

  function reserve(body: unknown, query: string) {
    const plan = routePlan();
    const app = createApp({
      plan: {
        ...plan,
        httpTriggers: [
          {
            ...plan.httpTriggers[0]!,
            id: "orders.reserve.route",
            targetFunctionId: "orders.reserve",
            config: {
              method: "POST",
              path: "/orders",
              request: {
                kind: "input",
                fields: {
                  quantity: { kind: "body", name: "quantity" },
                  limit: { kind: "query", name: "limit" },
                },
              },
              responses: [],
              middleware: [],
              transforms: [],
            },
          },
        ],
      },
      manifest: {
        ...runtimeCohort(plan.graphHash),
        functions: {},
        middleware: {},
        requestTransforms: {},
        targets: { "orders.reserve": target },
      },
      engine: {
        invoke: async (options) =>
          invokeFunction(target as unknown as InvocationTarget, options.input, {
            source: "http",
          }),
      },
    });
    return app.request(`http://localhost/orders${query}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("a numeric string in a JSON body fails an integer field", async () => {
    const response = await reserve({ quantity: "3500" }, "?limit=50");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      issues: [expect.objectContaining({ path: ["quantity"] })],
    });
  });

  test("a numeric query string still decodes for an integer field", async () => {
    const response = await reserve({ quantity: 3500 }, "?limit=50");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ quantity: 3500, limit: 50 });
  });
});

function routePlan(): RegistrationPlan {
  return {
    graphHash: "sha256:request-materialization",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "orders.get.route",
        source: { file: "src/routes/orders/route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "orders.get",
        config: {
          method: "GET",
          path: "/orders/:orderId/products/:productId",
          request: { kind: "input" },
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
