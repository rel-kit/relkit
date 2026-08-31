import { expect, test } from "bun:test";
import { invokeFunction } from "@relkit/testing";
import orders from "@app/orders/service.js";
import { bindFunctionEvents } from "@relkit/app/events";
import orderCreated from "@app/orders/events/order-created.event.js";

test("createOrder invokes pricing and publishes the order event", async () => {
  const published: unknown[] = [];
  const result = await invokeFunction(
    bindFunctionEvents(orders.createOrder, undefined, [orderCreated]),
    { orderId: "order-1", sku: "book", quantity: 3 },
    {
      clients: {
        events: {
          "orders.created": {
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
