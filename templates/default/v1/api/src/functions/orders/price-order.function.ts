import { defineFunction } from "@zsys/app";
import { z } from "@zsys/schema";

const priceOrder = defineFunction({
  input: z.object({ quantity: z.number().int().positive() }),
  output: z.object({ totalCents: z.number().int().nonnegative() }),
  handler: ({ quantity }) => ({ totalCents: quantity * 100 }),
});

export default priceOrder;
