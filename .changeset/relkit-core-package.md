---
"relkit": minor
"@relkit/app": minor
---

Breaking: `relkit` is now the core package. It contains everything an application imports at run time (functions, services, routes, events, jobs, cache, buckets, schemas, config, agents and the runtime), from its root and from subpaths such as `relkit/functions` and `relkit/events`. The 25 internal packages it replaces, such as `@relkit/engine`, `@relkit/functions` and `@relkit/runtime-hono`, are no longer published. `@relkit/app` re-exports `relkit` and is deprecated. `relkit create` runs `create-relkit` at the same version instead of installing it with `relkit`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
