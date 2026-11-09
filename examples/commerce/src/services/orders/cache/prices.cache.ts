/** Declares integer SKU prices in the requests cache profile with a one-minute default and five-minute maximum TTL. */
import { defineCache } from "relkit/cache";
import { z } from "zod";

const prices = defineCache({
  id: "orders.prices",
  profile: "requests",
  key: z.object({ sku: z.string() }),
  value: z.number().int().nonnegative(),

  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});

export default prices;
