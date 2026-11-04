import { expect, test } from "vitest";
import { RPCHandler } from "@orpc/server/fetch";
import { createRpcRouter } from "../../src/runtime-hono/rpc.js";
import type { HttpTriggerRegistration } from "../../src/graph/index.js";
import { channelPlan, manifest } from "./fixtures/channel-plan.ts";

const schema = {
  "~standard": { version: 1 as const, vendor: "test", validate: (value: unknown) => ({ value }) },
};

/** Builds one public route registration.
 * @param id - Trigger ID.
 * @param method - HTTP method.
 * @param path - Route path.
 * @param target - Target function ID.
 * @returns The registration.
 */
function trigger(id: string, method: string, path: string, target: string) {
  return {
    kind: "trigger",
    id,
    triggerType: "http",
    targetFunctionId: target,
    source: { file: "route.ts", line: 1, column: 1 },
    config: {
      method,
      path,
      client: { operation: "query" },
      middleware: [],
      responses: [],
      transforms: [],
    },
  } as unknown as HttpTriggerRegistration;
}

test("route procedures are mounted at their typed-client API paths", async () => {
  const plan = {
    ...channelPlan(),
    channels: [],
    httpTriggers: [
      trigger("route.get.orders.by-order-id", "GET", "/orders/:orderId", "orders.get-order"),
      trigger("route.head.orders.by-order-id", "HEAD", "/orders/:orderId", "orders.get-order"),
    ],
  };
  const calls: string[] = [];
  const target = { input: schema, output: schema, errors: [] };
  const { router, errorStatusMap } = createRpcRouter({
    plan,
    manifest: {
      ...manifest(plan, undefined),
      channels: {},
      functions: { "orders.get-order": target },
    },
    engine: {
      invoke: async (request: { readonly functionId: string; readonly input: unknown }) => {
        calls.push(request.functionId);
        return { ok: true, value: { echoed: request.input } };
      },
    } as never,
  });
  const handler = new RPCHandler(router, { errorStatusMap });
  const call = async (path: string) => {
    const result = await handler.handle(
      new Request(`http://relkit.test/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { orderId: "o1" } }),
      }),
      { context: {} as never },
    );
    return result.response?.status;
  };
  expect(await call("api/orders/getOrder")).toBe(200);
  expect(await call("api/orders/getOrderHead")).toBe(200);
  expect(await call("route.get.orders.by-order-id")).toBe(200);
  expect(await call("api/orders/missing")).toBeUndefined();
  expect(calls).toEqual(["orders.get-order", "orders.get-order", "orders.get-order"]);
});
