# @relkit/cache

Caches declare typed keys, values, logical profiles, and TTL policy. Runtime
clients are available only to functions that declare the cache dependency.

```ts
import { defineCache } from "@relkit/app/cache";
import { z } from "@relkit/app/schema";

export default defineCache({
  id: "prices",
  profile: "low-latency",
  key: z.object({ sku: z.string() }),
  value: z.number().int().nonnegative(),
  defaultTtlMs: 60_000,
  maxTtlMs: 300_000,
});
```

Declared functions receive a Promise client with schema-validated keys and
values. TTL options use the descriptor policy; numeric value schemas also
expose `increment`.
