import { defineCache } from "@relkit/app/cache";
import { z } from "@relkit/app/schema";

const prices = defineCache({
  id: "orders.prices",
  profile: "requests",
  key: z.object({ sku: z.string() }),
  value: z.number().int().nonnegative(),

  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});

export default prices;
