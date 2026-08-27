import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import orders from "../../src/services/orders.service.js";

test("createOrder invokes pricing and publishes the order event", async () => {
  const published: unknown[] = [];
  const result = await invokeFunction(
    orders.createOrder,
    { orderId: "order-1", sku: "book", quantity: 3 },
    {
      clients: {
        events: {
          orderCreated: {
            publish: async (payload: unknown) => {
              published.push(payload);
              return { accepted: true, instanceId: "event-1" };
            },
          },
        },
      },
    },
  );

  expect(result).toEqual({ orderId: "order-1", sku: "book", totalCents: 300 });
  expect(published).toEqual([{ orderId: "order-1", sku: "book", totalCents: 300 }]);
});
