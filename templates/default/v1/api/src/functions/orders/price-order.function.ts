import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const priceOrder = defineFunction({
  input: z.object({ quantity: z.number().int().positive() }),
  output: z.object({ totalCents: z.number().int().nonnegative() }),
  handler: ({ quantity }) => ({ totalCents: quantity * 100 }),
});

export default priceOrder;
