# Task 17.14 public-boundary and scope scans

## Result

All assigned public-boundary, dependency, graph, generated-project, package,
inspector, documentation, and source-scope scans passed. No public declaration
contains Effect, Hono, Next.js, Pulumi, AWS/cloud-client, or provider-client
types/imports, and no forbidden framework subsystem appears as a public API,
graph node kind, generated-project artifact, package, inspector navigation
entry, or source artifact.

| Area                                         | Evidence                                                                 | Result                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Public declarations                          | `bun run scripts/check-public-declarations.ts`                           | exit 0; 14 public packages; zero leaks                             |
| Forbidden dependency/import and source scope | `bun run check`                                                          | exit 0; 34 roots, 768 TypeScript files                             |
| Graph node kinds                             | focused compiler/graph/event tests                                       | 23 pass; approved kinds only; no subscription node                 |
| Event/source scope                           | `bun test packages/events/source-export.test.ts`                         | 3 pass; no public subscription source/name                         |
| Generated projects                           | `bun test tests/generator/option-matrix.test.ts`                         | 6 pass; 364 assertions; all templates and combinations scanned     |
| Package list/exports                         | `checkManifests(await packages())`                                       | 30 expected packages; version `0.0.0`; exact exports/dependencies  |
| Inspector navigation/protocol                | aggregate navigation check and `tests/inspector/inspector-scans.test.ts` | 15 allowed top-level paths; 2 pass; zero violations                |
| Documentation                                | aggregate shipped-doc artifact scan and focused Prettier check           | 7 files; no stale topology or forbidden artifact; formatting clean |
| Scope exclusions                             | aggregate `scanScope` plus `tests/phase0.test.ts`                        | zero findings; negative fixtures cover every rule                  |

The source scan now ignores generated `dist`, cache, and `.relkit` paths and
allowlists only the two internal stream-subscription implementation files plus
the E2E negative assertion. Public inspector API contracts remain scanned.

The rejected subsystem set is persistence, identity, workflow, knowledge,
plugin, marketplace, subscription, alternate-IaC, and Rust. Legitimate
provider-internal delivery metadata and release-review prose are not public
subsystems and remain covered by the existing narrow allowlists.

## Checks

| Command                                                                                                                                                                                                               | Result                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bun run verify`                                                                                                                                                                                                      | exit 0; fixed fail-fast pipeline passed           |
| `bun run typecheck` (inside verify)                                                                                                                                                                                   | exit 0                                            |
| `bun run test:types`                                                                                                                                                                                                  | exit 0; public inference/boundary fixtures passed |
| `bunx prettier --check docs/getting-started.md docs/testing.md docs/deployment.md docs/architecture.md docs/troubleshooting.md RELEASE_CHECKLIST.md RELEASE_NOTES.md AGENTS.md packages/events/source-export.test.ts` | exit 0                                            |
| `git diff --check`                                                                                                                                                                                                    | exit 0                                            |

No 17.15 or later checkbox was implemented.
