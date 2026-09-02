import { describe, expect, test } from "bun:test";
import {
  DependencyAccessError,
  invokeFunction,
  type InvocationCompletion,
} from "../../../packages/engine/src/index.ts";
import { bindDescriptorIdentity } from "../../../packages/invocation/dist/index.js";
import createOrder from "../../../examples/commerce/src/orders/functions/create-order.function.ts";
import getOrder from "../../../examples/commerce/src/orders/functions/get-order.function.ts";
import { z } from "../../../packages/schema/src/index.ts";

bindDescriptorIdentity(createOrder, "orders.create-order");
bindDescriptorIdentity(getOrder, "orders.get-order");

const orderInput = {
  orderId: "order-1",
  sku: "sku-1",
  quantity: 2,
  customerEmail: "customer@example.com",
};

describe("commerce example functions through the common engine", () => {
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
    const failure = await invokeFunction(getOrder, { orderId: "missing" }).catch(
      (error) => error as { readonly kind?: string; readonly id?: string },
    );
    expect(failure).toMatchObject({ kind: "application", id: "orders.not-found" });
  });

  test("rejects forged undeclared clients at runtime", async () => {
    let forgedClientCalled = false;
    const target = {
      id: "fixture.forged-client",
      input: z.object({}),
      output: z.object({ ok: z.literal(true) }),
      handler: (
        _input: unknown,
        _request: Request | undefined,
        context: { readonly signal: AbortSignal },
      ) => {
        const forged = context as unknown as {
          readonly cache: { readonly prices: { readonly get: () => Promise<unknown> } };
        };
        return forged.cache.prices.get().then(() => ({ ok: true as const }));
      },
    };
    const failure = await invokeFunction(
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
    ).catch((error) => error as { readonly kind?: string; readonly cause?: unknown });

    expect(forgedClientCalled).toBe(false);
    expect(failure.kind).toBe("defect");
    expect(failure.cause).not.toBeInstanceOf(DependencyAccessError);
  });
});
