/** Prices validated order input through the declared cache, records request tracing and derives its receipt key. */
import { defineFunction } from "@relkit/app/functions";
import prices from "../cache/prices.cache.js";
import { receiptObjectName } from "../../../platform/receipt-object.js";
import { createOrderOutput, orderInput } from "../../../platform/schemas.js";

const createOrder = defineFunction({
  // RELKIT validates these schemas before the handler runs.
  input: orderInput,
  output: createOrderOutput,
  dependencies: {
    cache: { prices },
  },
  timeoutMs: 10_000,
  concurrency: 100,
  handler: async (input, context) => {
    // Dependencies are accessed through the checked execution context.
    const unitPrice = await context.trace.span(
      "pricing.calculate",
      { attributes: { "pricing.strategy": "catalog" } },
      () => context.cache.prices.getOrSet({ sku: input.sku }, async () => 1_000),
    );
    context.trace.event("pricing.calculated", { "pricing.unit_cents": unitPrice });
    context.trace.setAttributes({ "pricing.quantity": input.quantity });
    const totalCents = unitPrice * input.quantity;
    return {
      orderId: input.orderId,
      receiptKey: receiptObjectName(input.orderId),
      totalCents,
    };
  },
});

export default createOrder;
