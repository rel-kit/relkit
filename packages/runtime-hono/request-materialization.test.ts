import { describe, expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION, type FunctionRequest } from "@zsys/contracts";
import type { RegistrationPlan } from "@zsys/graph";
import { createApp } from "./src/index.ts";

describe("framework-neutral HTTP request materialization", () => {
  test("preserves immutable params, repeated values, and transport metadata", async () => {
    const requests: FunctionRequest[] = [];
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
      mapInput: () => ({}),
      engine: {
        invoke: async (options) => {
          if (options.functionId === "orders.get" && options.request !== undefined)
            requests.push(options.request);
          return { ok: true };
        },
      },
    });

    const response = await app.request(
      "http://localhost/orders/order-1/products/product-2?tag=red&tag=blue",
      { headers: { "x-tags": "one, two" } },
    );

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.params).toEqual({ orderId: "order-1", productId: "product-2" });
    expect(request.query).toEqual({ tag: ["red", "blue"] });
    expect(request.headers.getAll("x-tags")).toEqual(["one", "two"]);
    expect(request.headers.get("x-tags")).toBe("one, two");
    expect(request.metadata).toEqual({
      kind: "http",
      routeId: "orders.get.route",
      pathPattern: "/orders/:orderId/products/:productId",
      requestId: "request.test",
      traceId: "trace.test",
      correlationId: "request.test",
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.params)).toBe(true);
    expect(Object.isFrozen(request.query)).toBe(true);
    expect(Object.isFrozen(request.query.tag)).toBe(true);
    expect(Object.isFrozen(request.headers)).toBe(true);
    expect(Object.isFrozen(request.headers.values)).toBe(true);
    expect(Object.isFrozen(request.metadata)).toBe(true);
    expect(() => Object.defineProperty(request.query, "extra", { value: "value" })).toThrow();
    expect(() => (request.query.tag as string[]).push("green")).toThrow();
    expect(request.clone().query).toEqual(request.query);
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
  };
}
