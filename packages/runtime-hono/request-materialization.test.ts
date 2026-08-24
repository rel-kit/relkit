import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { RegistrationPlan } from "@zsys/graph";
import { createApp } from "./src/index.ts";

describe("framework-neutral HTTP request materialization", () => {
  test("keeps params, repeated values, and headers inside HTTP input mapping", async () => {
    let mapped: import("./src/index.ts").HttpRouteRequest | undefined;
    const plan = routePlan();
    const app = createApp({
      plan,
      manifest: {
        contractVersion: MANIFEST_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphHash: plan.graphHash,
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
    middlewares: [],
  };
}
