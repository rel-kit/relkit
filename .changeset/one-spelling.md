---
"relkit": minor
"@relkit/app": minor
"@relkit/cli": minor
"@relkit/testing": minor
"@relkit/local": minor
"@relkit/aws": minor
---

Breaking: Each concept has one spelling. The legacy function-target `defineJob` and the `relkit/jobs/legacy` entry point are gone with their queue runtime; use `defineTask` and a task-backed `defineJob`, and `relkit add job` now scaffolds one. A function's `ctx.jobs.<name>` now triggers a run (`trigger(input)` returns a run handle) instead of `enqueue`. `defineApp` keeps the `jobs` provider key and drops `job`, `defaults.job` and the `compatibility` option, and `defineJob` accepts `service` but no longer `profile`. The schema builder keeps `void()` and drops `undefined()`, `relkit/schema` keeps `getJsonSchema` and drops `toJsonSchema`, and `relkit/routes` keeps `defineTransform` and drops `defineRequestTransform`. `@relkit/testing` no longer has `createTestJob`, and `@relkit/aws` no longer has `createSqsJobProvider`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
