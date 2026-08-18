import { describe, expect, test } from "bun:test";
import {
  DependencyAccessError,
  invokeFunction,
  type InvocationCompletion,
} from "../../../packages/engine/src/index.ts";
import createOrder from "../../../apps/fixture-commerce/src/functions/create-order.function.ts";
import getOrder from "../../../apps/fixture-commerce/src/functions/get-order.function.ts";
import handleOrderCreated from "../../../apps/fixture-commerce/src/functions/handle-order-created.function.ts";
import { z } from "../../../packages/schema/src/index.ts";

const orderInput = {
  orderId: "order-1",
  sku: "sku-1",
  quantity: 2,
  customerEmail: "customer@example.com",
};

describe("fixture functions through the common engine", () => {
  test("invokes cache, event, and job clients and applies function limits", async () => {
    const published: unknown[] = [];
    const enqueued: unknown[] = [];
    const completions: InvocationCompletion[] = [];
    const startTime = Date.now();
    const result = await invokeFunction(createOrder, orderInput, {
      now: () => startTime,
      clients: {
        cache: {
          prices: { getOrSet: async () => 1_000 },
        },
        events: {
          orderCreated: { publish: async (payload: unknown) => published.push(payload) },
        },
        jobs: {
          sendReceiptJob: { enqueue: async (input: unknown) => enqueued.push(input) },
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
    expect(published).toHaveLength(1);
    expect(enqueued).toEqual([{ orderId: "order-1", receiptKey: "order-1.json" }]);
    expect(createOrder.timeoutMs).toBe(10_000);
    expect(createOrder.concurrency).toBe(100);
    expect(completions[0]?.record.deadline).toBe(new Date(startTime + 10_000).toISOString());
  });

  test("invokes a fixture child directly and preserves declared errors", async () => {
    const records: Array<{ functionId: string; source: string; parentId?: string }> = [];
    const envelope = {
      instanceId: "event-1",
      eventId: "orders.created",
      version: 1,
      payload: {
        orderId: "order-1",
        sku: "sku-1",
        quantity: 1,
        customerEmail: "customer@example.com",
        totalCents: 1_000,
      },
      occurredAt: new Date(0).toISOString(),
      publishedAt: new Date(0).toISOString(),
      traceId: "trace-1",
      attributes: {},
    };
    const result = await invokeFunction(handleOrderCreated, envelope, {
      now: () => 0,
      clients: {
        functions: { getOrder },
        jobs: { sendReceiptJob: { enqueue: async () => undefined } },
      },
      hooks: {
        onCompletion: (event) =>
          records.push({
            functionId: event.record.functionId,
            source: event.record.source,
            ...(event.record.parentId === undefined ? {} : { parentId: event.record.parentId }),
          }),
      },
    });

    expect(result).toEqual(envelope);
    expect(records.map(({ functionId }) => functionId)).toEqual([
      "orders.get",
      "orders.handle-created",
    ]);
    const child = records.find(({ functionId }) => functionId === "orders.get");
    expect(child?.source).toBe("direct");
    expect(child?.parentId).toBeDefined();

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
      handler: (_input: unknown, context: { readonly signal: AbortSignal }) => {
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
