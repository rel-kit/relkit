/** A function whose handler returns an Effect and fails with a declared error. */
import { Effect } from "effect";
import { defineError, defineFunction } from "relkit";
import { failEffect } from "relkit/effect";
import { s } from "relkit/schema";

export const orderNotFound = defineError({
  id: "orders.order-not-found",
  data: s.object({ orderId: s.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
});

const orders = new Map([["order-1", { id: "order-1", total: 42 }]]);

export default defineFunction({
  id: "orders.get-order",
  input: s.object({ orderId: s.string() }),
  output: s.object({ id: s.string(), total: s.number() }),
  errors: [orderNotFound],
  handler: ({ orderId }) =>
    Effect.gen(function* () {
      const order = orders.get(orderId);
      if (order === undefined) return yield* failEffect(orderNotFound, { orderId });
      return order;
    }).pipe(Effect.withSpan("orders.lookup")),
});
