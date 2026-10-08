# Shared foundation evidence

Phase completed before package service authors opened their broad refactors.
All 66 changed/new TypeScript files have independent reviewer coverage, with
no remaining actionable findings. The exact file hashes and reviewer owners at
this boundary are captured in phase-2-files.json.

## Verified foundation

- Bun remains 1.3.10. Default catalog contains 35 shared concrete pins; named
  peer catalog retains React and TanStack compatibility ranges. Workspace array
  and first-party workspace dependencies are preserved.
- Effect and the installed platform-node/platform-node-shared/platform-bun,
  SQL-Pg, Vitest, and docgen cohort resolve to stable 4.0.1. No RC Effect version
  appeared in the inspected installed dependency graph.
- Frozen installation passed after the final canonical Drizzle patch was
  applied. Patch contains 54 declaration files: 46 stable SQL error import
  repairs and 30 optional configuration field unions across eight files.
- Cold topological Turbo build passed all 52 framework/integration packages,
  including generator assets and the bundled Next inspector.
- Repository typecheck passed, including the commerce compiler check with no
  diagnostics and a valid runtime activation fingerprint.
- Stable CLI execution probes preserve explicit flags, invalid port rejection,
  unknown-command handling, and JSON invocation behavior.
- Strict native PostgreSQL declarations, negative SQL error/service probes,
  and native LISTEN suite passed 8/8, with dependency checking enabled and
  unchanged deadlines. Real Docker EffectMQ acceptance passed durable enqueue,
  deduplication, restart, retries, cancellation, and scheduling.
- Shared execution observation now includes bounded cli/generator owners. Its
  isolated registry test passed. Existing metrics/logging/runners are reused.
- Documentation generator completed with stable docgen, checking extracted
  examples. Native compatibility reference was regenerated; manual native
  Drizzle consumers are told how to own the app-level patch registration.
- Generator final focused foundation suite passed 85/85 after transitive owner
  and shared resolver corrections, including real scaffold/compiler acceptance.
- Full package Vitest cohort passed 612 files / 2451 tests, with one declared
  skip. Bun CLI cohort passed 112 tests across 36 files; other Bun package
  suites passed 277 across 85 files. Package command exited zero. One obsolete
  CLI snapshot was reported; its test already uses explicit assertions.

## Review findings and corrections

- Drizzle's optional PostgreSQL/Cockroach config declarations were incompatible
  with exact optional property typing. Canonical patch now accepts explicit
  undefined only on optional config interface fields.
- An overbroad first repair also changed constructors. Strict compilation and
  independent review caught it. Constructor changes were removed; the final
  asset and installed declarations were independently verified.
- Bun's patch parser rejected blank separators accepted by Git's diff parser.
  Separators were removed and forced installation succeeded. Ordinary install
  had retained a cached patch, so source edits alone were not claimed as an
  installation verification.
- Stable Scope.close requires Closeable. DuckDB's process owner now explicitly
  supplies its existing closeable scope instead of attempting to close an
  ambient borrowing-only Scope.
- Duplicate tooling/project catalog resolution was found during review. One
  pure strict resolver is shared; project adapters retain their public
  invalid-project error translation.
- EffectMQ and testing install Drizzle transitively. Scaffold patch planning
  includes these owners, including patch-only repair for older
  projects without a direct Drizzle declaration.

## Source and ownership evidence

The ignored vendor is read-only in the original checkout. Scope implementation
and some PgClient sources are absent there; installed 4.0.1 implementation and
examples were inspected together with vendor process/SQL tests. Vendor stable
process spawning and SQL error sources match installed files, while vendor CLI
Command differs and is checked against installed stable source.

Root's 18 supporting and 25 tooling TypeScript changes are independently covered
in phase-2-native-review.md. Generator's 21 files are independently covered in
phase-2-generator-review.md. Native
compiler probe files are independently reviewed by the tooling author; their
implementer is excluded as reviewer. These disjoint review scopes cover all 66
changed and new TypeScript files. Final root typecheck and frozen install passed
after the shared resolver and transitive-owner corrections.

Original checkout remains clean at its captured HEAD. Demo manifests, links,
locks, and historical evidence have not been modified. Fresh Luna credential
input is pending through the secure environment, and no paid replay is claimed.
