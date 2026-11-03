---
"relkit": minor
"@relkit/app": minor
"@relkit/cli": minor
"@relkit/drizzle": minor
"@relkit/testing": minor
"@relkit/inspector": minor
"create-relkit": minor
---

Breaking: No package exports an `internal/*` subpath. The entry points RelKit's own packages share drop the `internal` segment, for example `relkit/host`, `@relkit/drizzle/server` and `create-relkit/add-types`; they are not supported application imports. `@relkit/cli/supervisor/internal/request` and `@relkit/inspector/observability-local/internal/local-worker` are removed.
