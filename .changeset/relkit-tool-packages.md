---
"@relkit/cli": minor
"@relkit/inspector": minor
"@relkit/pulumi": minor
"relkit": minor
---

Breaking: The compiler, client generator and process supervisor are now part of `@relkit/cli`, and local diagnostic history is part of `@relkit/inspector`. The Pulumi deployment engine is part of `@relkit/pulumi`, and the Inspector bridge is part of `relkit`. `@relkit/compiler`, `@relkit/client-generator`, `@relkit/supervisor`, `@relkit/deploy-pulumi`, `@relkit/inspector-api` and `@relkit/observability-local` are no longer published. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
