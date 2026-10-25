// Dependencies are accessed through the checked execution context.
const unitPrice = await context.trace.span(
  "pricing.calculate",
  { attributes: { "pricing.strategy": "catalog" } },
  () => context.cache.prices.getOrSet({ sku: input.sku }, async () => 1_000),
);
context.trace.event("pricing.calculated", { "pricing.unit_cents": unitPrice });
context.trace.setAttributes({ "pricing.quantity": input.quantity });
