import { defineFunction } from "@relkit/app";
import { z } from "@relkit/schema";

const priceOrder = defineFunction({
  input: z.object({ quantity: z.number().int().positive() }),
  output: z.object({ totalCents: z.number().int().nonnegative() }),
  handler: ({ quantity }) => ({ totalCents: quantity * 100 }),
});

export default priceOrder;
