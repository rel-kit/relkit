/** Exercises maintained grouped commerce sources through the native acceptance boundary. */
import { expect, test } from "bun:test";
import {
  invokeFunction,
  type InvocationCompletion,
  type InvocationContext,
} from "../../../packages/engine/src/index.ts";
import { bindDescriptorIdentity } from "../../../packages/invocation/dist/index.js";
import createOrder from "../../../examples/commerce/src/services/orders/functions/create-order.function.ts";
import getOrder from "../../../examples/commerce/src/services/orders/functions/get-order.function.ts";
import { z } from "../../../packages/schema/src/index.ts";

bindDescriptorIdentity(createOrder, "orders.create-order");
bindDescriptorIdentity(getOrder, "orders.get-order");

const orderInput = {
  orderId: "order-1",
  sku: "sku-1",
  quantity: 2,
  customerEmail: "customer@example.com",
};

test("invokes cache clients and applies function limits", async () => {
  const completions: InvocationCompletion[] = [];
  const startTime = Date.now();
  const result = await invokeFunction(createOrder, orderInput, {
    now: () => startTime,
    clients: {
      cache: {
        prices: { getOrSet: async () => 1_000 },
      },
    },
    hooks: {
      onCompletion: (event) => completions.push(event),
    },
  });

  expect(result).toEqual({
    orderId: "order-1",
    receiptKey: "order-1.json",
    totalCents: 2_000,
  });
  expect(createOrder.timeoutMs).toBe(10_000);
  expect(createOrder.concurrency).toBe(100);
  expect(completions[0]?.record.deadline).toBe(new Date(startTime + 10_000).toISOString());
});

test("preserves declared application errors", async () => {
  await expect(invokeFunction(getOrder, { orderId: "order-1" })).resolves.toMatchObject({
    orderId: "order-1",
    status: "confirmed",
  });
  await expect(invokeFunction(getOrder, { orderId: "missing" })).rejects.toMatchObject({
    kind: "application",
    id: "orders.not-found",
  });
});

test("rejects forged undeclared clients at runtime", async () => {
  let forgedClientCalled = false;
  const target = {
    id: "fixture.forged-client",
    input: z.object({}),
    output: z.object({ ok: z.literal(true) }),
    handler: async (_input: Record<string, never>, context: InvocationContext) => {
      const cache = Reflect.get(context, "cache");
      if (typeof cache !== "object" || cache === null)
        throw new TypeError("Undeclared cache was withheld");
      const prices = Reflect.get(cache, "prices");
      if (typeof prices !== "object" || prices === null)
        throw new TypeError("Undeclared prices client was withheld");
      const get = Reflect.get(prices, "get");
      if (typeof get !== "function") throw new TypeError("Undeclared cache getter was withheld");
      await Reflect.apply(get, prices, []);
      return { ok: true as const };
    },
  };
  const invocation = invokeFunction(
    target,
    {},
    {
      clients: {
        cache: {
          prices: {
            get: async () => {
              forgedClientCalled = true;
              return 1;
            },
          },
        },
      },
    },
  );
  await expect(invocation).rejects.toMatchObject({ kind: "defect" });
  const failure = await invocation.catch((error) => error);

  expect(forgedClientCalled).toBe(false);
  expect(failure).not.toHaveProperty("cause");
});
