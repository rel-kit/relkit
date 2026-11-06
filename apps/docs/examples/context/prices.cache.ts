import { defineCache } from "relkit/cache";
import { z } from "zod";

const prices = defineCache({
  id: "orders.prices",
  key: z.object({ sku: z.string() }),
  value: z.number().int().nonnegative(),
  defaultTtlMs: 60_000,
});

export default prices;
