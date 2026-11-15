/** Cache bound to the application's single cache adapter. */
import { defineCache } from "relkit/cache";
import { s } from "relkit/schema";

export default defineCache({
  id: "orders.prices",
  key: s.object({ sku: s.string() }),
  value: s.number().int(),
  defaultTtlMs: 60_000,
});
