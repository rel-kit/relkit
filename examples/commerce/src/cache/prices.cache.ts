import { defineCache } from "@relkit/app/cache";
import { priceKey, priceValue } from "@app/shared/schemas.js";

const prices = defineCache({
  id: "prices",
  profile: "default",
  key: priceKey,
  value: priceValue,
  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});

export default prices;
