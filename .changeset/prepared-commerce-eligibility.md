---
"@relkit/cli": patch
"create-relkit": patch
---

Support declarative SQLite/Drizzle and Better Auth applications in prepared
development startup. Audit SQLite metadata callbacks and literal descriptor
options, defer native database client lifecycle work until activation, and reject
ambient values, eager clients and imports outside the audited backend sources.
Tooling stays fingerprinted without being evaluated during eligibility checking.
Generated SQLite services store mutable data under `.relkit/state` and create
missing parent directories only during migration or runtime client acquisition.
Validate and narrow database paths before filesystem setup so generated services
also compile with the generic environment context.
