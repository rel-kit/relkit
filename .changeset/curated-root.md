---
"relkit": minor
"@relkit/app": minor
---

Breaking: The `relkit` entry point exports only the Promise-based functions and the types applications write against, such as `defineFunction`, `defineRoute`, `fail`, `http` and their option and descriptor types. Every other name moves to its `relkit/<area>` subpath, for example `relkit/jobs` or `relkit/functions`. The Effect forms, such as `failEffect`, `defineFunctionEffect` and `httpEffects`, are in the new `relkit/effect` entry point, and `failEffect` now fails the Effect with the declared error instead of succeeding with a failure wrapper. `@relkit/app` keeps exporting every name it exported before. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
