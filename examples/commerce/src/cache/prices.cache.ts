import { defineCache } from "@relkit/app";
import { priceKey, priceValue } from "../shared/schemas.js";

const prices = defineCache({
  id: "prices",
  profile: "default",
  key: priceKey,
  value: priceValue,
  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});

export default prices;
