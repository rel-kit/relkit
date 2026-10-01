# Compiler Effect API alignment evidence

Implementation and verification completed on 2026-10-01. Work began at approximately 05:20:57 UTC; final verification and evidence preparation reached 06:22 UTC, approximately 61 minutes later.

## Review coverage

Reviewed all 255 authored files through EOF: 224 compiler source/companion files (137 root, 59 discovery, 28 jobs), 28 package test/fixture files, and three package/TypeScript configuration files. The final source/test inventory contains 26,163 lines. Hidden and ignored authored sources were included; dependency, vendor, generated coverage, build output, and runtime data were excluded from implementation scope. All implementation files are at or below 250 lines.

The starting worktree already contained extensive overlapping compiler changes and unrelated changes. An external initial-content snapshot supported incremental review; this application changed 77 source/test files relative to that snapshot, including two type companions and three regression test files. The entire scoped authored source was reviewed, followed by the complete incremental implementation diff. Existing staged changes were preserved; no staging, commit, push, checkout, reset, or archive operation was performed.

## Result

Package manifest roots now decode before record access, and named native package methods expose contextual I/O and validation failures. Package ownership/export checks, route syntax, runtime planning/imports, activation input, and artifact preflight compose typed rejection directly. Legacy execution adapters retain supported error values, messages, codes, and generated output behavior.

Configuration uses exhaustive private parse decisions and existing Schema field constraints, preserving complete ordered issues, defaults, unknown-key rejection, and UNC roots. Evaluator options decode before property access and accept absent or explicitly undefined optional policy fields. Schema projection results distinguish successful evidence from rejection without changing wire records or live Standard Schema interop.

Normalization offers a caller-provided source-reader core while retaining the native convenience entrypoint. Nested source, middleware, and publication validation compose in the caller runtime. Existing coordinator recovery, process supervision, detector rollback, exclusive atomic publication, worker immutability/preflight, and environment allowlisting remain covered by package regressions and acceptance tests.

Compiler/jobs observers cover missing standalone and native operations with bounded labels and applicable lazy workload counts, including generated UTF-8 bytes. Isolated caller registries, supplied tracers/loggers, deterministic clocks, failures, defects, interruption, nested ownership, and output-hook suppression are tested. No exporter or transport was added. Root/discovery/jobs TSDoc examples compile through the package's virtual TypeScript example checks.

## Verification

| Check                                                                       | Result                                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bunx vitest run packages/compiler/tests`                                   | 25 files, 132 tests passed; existing 117-test baseline plus 15 focused regressions.                                                                                |
| `bunx tsc -p packages/compiler/tsconfig.tests.json --noEmit --pretty false` | Passed, including explicit undefined option coverage.                                                                                                              |
| `bun run test:compiler`                                                     | 32 files, 128 Bun compiler acceptance tests passed; 20 files, 175 graph Vitest tests passed.                                                                       |
| `bunx tsc -b packages/compiler/tsconfig.json --pretty false`                | Passed.                                                                                                                                                            |
| `bunx prettier --check packages/compiler/src packages/compiler/tests`       | Passed.                                                                                                                                                            |
| `bun run lint`                                                              | Passed; 90 public authoring source/example fragments.                                                                                                              |
| `bun run test:types`                                                        | Passed; public descriptor inference and boundary rejection fixtures.                                                                                               |
| `bun run konsistent -- validate`                                            | Passed; configuration valid.                                                                                                                                       |
| `bun run check`                                                             | Fails solely on existing ignored `packages/compiler/coverage/coverage-final.json:20:3029`, `out-of-scope-navigation-name`.                                         |
| Authored boundary scan                                                      | Passed: 61 roots, 3,462 TypeScript files. The existing coverage directory was temporarily preserved outside the repository scan and restored in a `finally` block. |
| `bun test tests/phase0.test.ts`                                             | 26 passed, one failed: public package export guardrail.                                                                                                            |
| `bun run scripts/pack-and-smoke-exports.ts`                                 | Isolates that failure to the unsupported `packages/events` export map. `git diff HEAD -- packages/events/package.json` is empty; this manifest was not changed.    |

Compiler acceptance covers canonical commerce, shuffled roots/order, graph hashes, watch/full-build equality, activation suppression, and legacy adapters. Package lifecycle coverage includes source-reader injection, repeated invocation state, interruption cleanup, evaluator output/input failure and deadline partial output, detector restoration, foreign temporary ownership, rename failure, worker preflight, and unchanged mtimes. Canonical artifact and protocol versions remain unchanged.

## Limits and exclusions

Effect and `@effect/vitest` remain pinned to `4.0.0-rc.115`; package and TypeScript configurations match the starting snapshot. No dependency, vendor, normative protocol, or reference-checkout edits were made. The read-only `repos/effect` checkout lacks version-matched core implementations/tests and top-level guidance files. Retained upstream usages/tests and installed implementations/embedded examples were inspected; installed rc.115 source and executable compiler regressions provide version compatibility evidence. Additional API evidence and gaps are recorded in the design.

The two broader guardrail failures above remain reported without weakening checks or changing unrelated files. Full monorepo acceptance, root-wide typecheck/build, prepush, Docker, and cloud acceptance were not run. No cloud resources were created or charged. The change remains uncommitted and ready for review; archiving requires a separate request.
