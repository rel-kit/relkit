## 1. Complete scoped source review

- [x] 1.1 Refresh authored-file inventory, applicable guidance, overlapping dirty changes, and installed pins; verify hidden/ignored authored files are included and generated/dependency/vendor files are excluded without changing user work.
- [x] 1.2 Read every root compiler source/companion and package/TypeScript configuration through EOF, reusing planning reads where still current; verify each domain operation, native boundary, model, failure, documentation contract, and API-family applicability against design decisions.
- [x] 1.3 Read every discovery source/companion through EOF; verify candidate hook ownership, sequential evaluation, framing, schema projection, source-reader injection, and callback exceptions against the retained upstream usages and installed source.
- [x] 1.4 Read every jobs source/companion and compiler test/fixture through EOF; verify worker immutability, preflight/publication ownership, existing regression coverage, and documentation examples without introducing a separate per-symbol ledger.
- [x] 1.5 Inspect implementation, examples/usages, and available tests for newly selected APIs, including any Data, Schema, Logger, or tracer helpers; verify rc.115 signatures with installed source and record any additional missing upstream evidence in this design.

## 2. Correct validation and failure ownership

- [x] 2.1 Decode native package manifest roots before returning records, preserve contextual read/JSON syntax failures, and name the metadata service methods; verify null/array/primitive JSON is typed rejection, valid unrelated fields survive, and injected reader defects remain defects.
- [x] 2.2 Make package ownership, catalog/authoring export, runtime registration, role, and containment validation composable typed operations; verify independently called invalid operations expose tagged failures and legacy package resolution retains supported exception messages/values.
- [x] 2.3 Replace route-validation defect bridges with direct typed rejection while preserving pure lexical leaf helpers; verify malformed/ambiguous segments and optional catch-all behavior through both Effect and synchronous APIs.
- [x] 2.4 Replace runtime integration plan validation bridges with typed ownership/registration failures; verify missing packages, duplicate owners, protocol mismatches, legacy error codes, and deterministic import/plan bytes.
- [x] 2.5 Make artifact extension preflight return typed rejection directly; verify unsupported versions, duplicate extensions, invalid content, and accessor defects start no publication and retain existing Promise failure shapes.
- [x] 2.6 Remove the configuration non-null assertion using explicit parse success/rejection states and applicable field/record schemas; verify complete ordered issues, unknown-key rejection, root/port validation, defaults, UNC paths, and unchanged loaded configuration shape.
- [x] 2.7 Review evaluator request/options and compiler-owned boundary/result models, reuse existing schemas/contracts, and make applicable internal states exhaustive; verify malformed records, absent versus explicit undefined, live Standard Schema interop, and unchanged wire/result shapes with focused tests/type checks.

## 3. Complete composition and native ownership

- [x] 3.1 Extract source-dependent normalization/discovery cores where native provisioning currently overwrites caller readers; verify injected readers are honored while existing default-providing entrypoints retain their signatures/results and do not instrument the owning operation twice.
- [x] 3.2 Review remaining native access in project checking, metadata, generation, and discovery; compose named effects and explicit dependencies where appropriate, verify no domain stage runs an internal synchronous/Promise execution adapter, and retain required native callback contracts.
- [x] 3.3 Preserve the normalization coordinator's deliberate pass-to-diagnostic recovery and observer/interruption boundaries; verify repeated execution allocates fresh state, pass order is exact, recoverable exceptions continue later passes, and observer defects/interruption propagate.
- [x] 3.4 Verify evaluator input/read failure supervision, deadline partial output, scoped reader cancellation, kill/reap order, detector rollback, and cleanup failure aggregation; retain existing deterministic process/detector tests and add only uncovered changed-behavior regressions.
- [x] 3.5 Verify atomic writer and worker storage/preflight semantics, including narrow interruption masking and exclusive cleanup ownership; run artifact/worker lifecycle tests covering unchanged mtimes, rename failure, foreign temporary files, concurrent preflight failure, and cleanup before cancellation settles.
- [x] 3.6 Preserve evaluator Config/ConfigProvider environment allowlisting at runtime edges; verify absent and explicit empty entries with injected providers and ensure domain code introduces no direct environment reads.

## 4. Complete operation telemetry

- [x] 4.1 Add bounded labels and shared observation to uncovered standalone package/planning/generation operations and named native service methods; verify operation/outcome/duration counts for direct and composed calls and exempt only documented pure leaves/instrumentation utilities.
- [x] 4.2 Replace empty workload callbacks where input/output counts apply, including discovery files, descriptors, registrations, diagnostics, schemas, and generated bytes; verify lazy getter evaluation and correct operation-owned counts without raw input labels or accidental counter duplication.
- [x] 4.3 Test compiler/jobs telemetry with isolated caller registries, supplied tracer/log capture, deterministic clocks, expected failures, defects, and interruption; verify one terminal observation and unchanged success/failure channels for standalone and nested calls.
- [x] 4.4 Verify telemetry during evaluator hook ownership does not contaminate frames, captured stdout/stderr, or direct-output diagnostics; assert caller sink provisioning and unchanged canonical artifact bytes without adding an exporter or logger transport.

## 5. Finish contracts and organization with implementation

- [x] 5.1 Complete root-module TSDoc, remove duplicate/stale comments, and extract remaining named types/interfaces into meaningful companions during the corresponding implementation edits; verify summaries, parameters, returns, generic roles, lifecycle/errors, type-only re-exports, and files at or below 250 lines.
- [x] 5.2 Complete discovery/jobs documentation and companion contracts during their implementation edits; verify synchronous native callback exceptions, detector ownership, versioned wire records, immutable worker behavior, and one blank line between declarations against the formatter.
- [x] 5.3 Extend the existing package-owned virtual TypeScript example checks to meaningful root/discovery workflows and service APIs; verify actual snippets compile with real imports, required provisioning, declared caller inputs, typed recovery, and execution/cleanup boundaries.

## 6. Verify integrated compatibility and review the result

- [x] 6.1 Run `bun x vitest run packages/compiler/tests` and `bun x tsc -p packages/compiler/tsconfig.tests.json --noEmit --pretty false`; verify the existing 117-test baseline and new focused regressions pass without arbitrary sleeps or tests outside the owning package.
- [x] 6.2 Run `bun run test:compiler` using the repository's explicit acceptance path and graph Vitest suite; verify canonical commerce, shuffled-root/order fixtures, hashes, watch/full-build equality, activation suppression, and legacy adapters remain compatible.
- [x] 6.3 Batch affected formatting, compiler package typechecking, `bun run check`, `bun run lint`, `bun run test:types`, `bun test tests/phase0.test.ts`, and structural validation required by changed imports/exports; verify all results or document pre-existing/unavailable failures without weakening checks.
- [x] 6.4 Review the complete implementation diff and new files for Effect composition, truthful failure channels, native authority, lifecycle, standalone telemetry, checked docs, spacing, and type placement; verify only applicable API families were adopted and no dependency/vendor/protocol changes or user-owned Git operations occurred.
- [x] 6.5 Validate the completed OpenSpec change and record actual coverage, checks, exclusions, limitations, and elapsed time; verify changes remain uncommitted and no cloud/Docker/full-monorepo acceptance is reported unless actually run.
