# RelKit provider starter

A cache provider to copy, rename and point at your own backend. It builds, tests and packs as is:
an in-memory cache with the two entries every RelKit provider has and the shared conformance suite
from `@relkit/testing`.

- `src/index.ts` is the authoring entry. `starterCache()` returns the descriptor an application
  puts in `relkit.config.ts`; it is data only.
- `src/runtime.ts` is the runtime entry. `createStarterCacheProvider()` implements the cache
  provider interface from `relkit/cache`, and `runtimeIntegration` registers it for the adapter id
  the descriptor names.
- `package.json` declares both entries under `relkit.integration`, so RelKit finds the runtime
  entry without importing your package at check time. Keep the name in the form `relkit-<name>` or
  `@<scope>/relkit-<name>`: `relkit check` reads integration metadata only from packages named
  that way (and from `relkit` and `@relkit/*`).
- `tests/conformance.test.ts` runs `@relkit/testing/cache-conformance`, one test per case, with a
  failing store for the failure-injection case.

```sh
bun install
bun test
bun run build
bun pm pack
```

Install the packed file into an app (`bun add ./relkit-provider-starter-0.1.0.tgz`) and select it:

```ts title="relkit.config.ts"
import { defineApp } from "relkit/config";
import { starterCache } from "relkit-provider-starter";

export default defineApp({
  cache: { memory: starterCache() },
  defaults: { cache: "memory" },
});
```

The full walkthrough is the provider-author guide: https://relkit.dev/docs/modules/integrations/provider-kit
