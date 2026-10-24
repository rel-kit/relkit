---
"@relkit/app": minor
"@relkit/cli": minor
"@relkit/compiler": minor
"@relkit/contracts": minor
"@relkit/inspector-api": minor
"@relkit/inspector": patch
"@relkit/observability": minor
"@relkit/observability-local": patch
"@relkit/supervisor": patch
"create-relkit": minor
---

Disable development inspection by default and move the UI, collector and diagnostic
history into the separately installed `@relkit/inspector` tool. Enabled applications
publish a private authenticated bridge that survives reloads; the CLI no longer
installs or starts Next.js, React, DuckDB or a history worker. Production excludes
rich inspection even when development inspection is enabled.

Preserve project history with transactional replay receipts, bounded redacted
capture and explicit incomplete states. Ship an independent non-root Docker build
with directory credentials and persistent project-bound history. The tool keeps its
own release identity; image and package publication require separate authorization.
