import { defineCache } from "@relkit/app/cache";
import { z } from "@relkit/app/schema";

const rateLimits = defineCache({
  id: "orders.rate-limits",
  profile: "timeline",
  key: z.string(),
  value: z.number().int().nonnegative(),
});

export default rateLimits;
