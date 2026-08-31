import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import prices from "@app/orders/cache/prices.cache.js";

const getPrice = defineFunction({
  id: "orders.get-price",

  input: z.object({ sku: z.string().min(1) }),
  output: z.object({ sku: z.string(), unitPriceCents: z.number().int().nonnegative() }),

  dependencies: { cache: { prices } },

  handler: async ({ sku }, context) => {
    const unitPriceCents = await context.cache.prices.getOrSet({ sku }, async () => {
      // Runs on a cache miss. Replace the demo price with your database lookup.
      context.log.info("price.loaded", { sku });
      return 1_000;
    });

    return { sku, unitPriceCents };
  },
});

export default getPrice;
