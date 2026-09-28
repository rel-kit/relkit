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

The package also exposes Effect operations for callers that compose workflows
or replace the provider with a test Layer. The Promise client runs the same
Effect implementation. Import `createCacheClientEffect` from `@relkit/cache`
to create a client in an Effect runtime, then run operations such as
`cache.get("sku")` in that runtime.

Cache operations emit `cache.<operation>` spans and bounded call, failure, and
duration metrics. Bridge spans use `relkit.cache.<operation>` without cache IDs
in names or attributes. A `CacheTelemetry` Layer can replace that observer in tests.
Schema and TTL failures retain their exported names, codes, messages, and
`TypeError` or `RangeError` classifications. Their `_tag` fields also support
typed Effect recovery.
