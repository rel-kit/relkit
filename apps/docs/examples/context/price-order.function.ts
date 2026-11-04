import { defineFunction } from "@relkit/app/functions";
import { z } from "zod";

const priceOrder = defineFunction({
  input: z.object({
    unitCents: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
  }),
  output: z.object({ totalCents: z.number().int().nonnegative() }),
  handler: async ({ unitCents, quantity }) => ({ totalCents: unitCents * quantity }),
});

export default priceOrder;
