import { defineCache } from "@relkit/app";
import { priceKey, priceValue } from "../../platform/schemas.js";

const prices = defineCache({
  id: "orders.prices",
  profile: "default",
  key: priceKey,
  value: priceValue,
  defaultTtlMs: 1_000,
  maxTtlMs: 5_000,
});

export default prices;
