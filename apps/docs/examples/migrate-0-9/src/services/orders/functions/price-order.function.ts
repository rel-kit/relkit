import { defineFunction } from "relkit/functions";
import { s } from "relkit/schema";

const priceOrder = defineFunction({
  input: s.object({ quantity: s.number().int().positive() }),
  output: s.object({ totalCents: s.number() }),
  handler: async ({ quantity }) => ({ totalCents: quantity * 1_000 }),
});

export default priceOrder;
