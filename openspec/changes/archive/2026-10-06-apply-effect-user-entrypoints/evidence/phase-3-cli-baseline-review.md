# Independent retained CLI test and fixture review

Reviewer: `/root/plan_create_relkit`. This is the disjoint top-level test/fixture
slice delegated after the invocation/jobs and telemetry reviews. It does not mark
OpenSpec task status.

All 37 retained authored TypeScript files were read through EOF and classified at
the SHA-256 values in `phase-3-cli-baseline-review-files.json`: 34 native Bun test
files, one existing Vitest invocation test file and two controlled test fixtures.
The two editor tests are excluded because the other independent lane and parent
already reviewed them. New nested domain/service tests belong to their explicit
independent owners.

The retained tests exercise compiler/build/start artifact consistency, generated
runtime source, optional-peer standalone bundling, client metadata validation,
local leases/provider rewrites, command formatting/redaction, environment handling,
real dev candidate reload/cancellation/draining, route recovery, and legacy public
exit/output/consent compatibility. They remain tests of the public Promise or
pure source/parser contracts. New Effect service behavior is covered by the nested
`@effect/vitest` suites and executed strict service-authority probes, rather than
rewriting retained fixtures into another application service graph.

The two helper leaves are controlled fixture adapters. `test-workspace.ts`
creates dependency links under temporary caller-owned roots; callers remove those
roots. `regression-13-13-fixtures.ts` renders native candidate server text, polls
controlled readiness and creates test sessions that its callers stop and join.
Neither helper is production application authority. Tests with real child/server
resources use teardown/try-finally or explicit session stop; mock SDK/Automation
boundaries do not perform cloud mutations.

Full-file review includes the build-server and specialized-logging assertions for
the emitted runtime's internal owner/instrumentation shape. The standalone
bundling fixture now copies the native Effect adapter cohort, so workspace optional
peers cannot hide missing/hoisted/nested dependency behavior. The completed native
gate found the three integration gaps below. Their owners corrected all three,
and independent rereads and affected regression reruns now pass. No finding
remains at the recorded hashes.

## Findings from the native gate

1. `readBuilt` returns the generic graph-reader stale-version diagnostic instead
   of its preserved built-artifact diagnostic. The retained `commands-core` test
   expects the existing instruction to rebuild, and currently receives an
   instruction to regenerate with check. The start owner restored the built
   version check before general graph validation. The full graph structure and
   production checks remain required afterward. All three affected source/test
   leaves were independently reread through EOF. The targeted commands-core build
   regression passes; the new controlled Effect compatibility test passes and
   its actual body compiles strictly with zero diagnostics.
2. The existing `startProject` spawn override uses inherited stderr. The new
   native process owner drains both stdout and stderr unconditionally, calling
   `pipeTo` on the absent inherited stream. The real `product-runtime` test fails
   before startup. The start owner now owns/drains only actual readable pipes and
   retains inherited terminal output as borrowed. The real full-graph
   product-runtime regression passes after independent source reread.
3. The relocated optional-peer bundling fixture copies the filesystem service but
   misses its newly split `filesystem-exclusive.ts` dependency. All five
   standalone bundling cases fail before the bundler runs. Reported to the CLI
   author; the fixture must retain standalone optional-peer isolation while
   carrying the complete helper cohort. The author added the exclusive filesystem
   leaf and its type companion; both and the complete changed fixture were
   independently reread. The missing/hoisted/nested optional-peer isolation and
   required-import failure assertions remain meaningful. All five native cases
   pass in the independent affected rerun.

## Verification

A single focused native batch covers the 27 remaining Bun test files. Earlier
independently checked native jobs/telemetry and already executed doctor/start/
main/scaffolding groups are omitted to avoid redundant broad compiler loops.
The initial batch physically completed: 80 passed and seven failed across 27 files
in 63.89 seconds. The two corrected production boundaries pass affected native
reruns (one build case in 2.20 seconds and one product runtime case in 2.76 seconds).
The new controlled compatibility Effect case passes in 2.00 seconds, and its strict
actual-body compiler gate has zero diagnostics. All five standalone bundling
fixture cases pass in 1.066 seconds after their narrow cohort fix. Thus all 87
native cases pass across the initial run and seven affected-case reruns; the full
27-file batch was not redundantly repeated. No implementation or test source in
this slice was changed by this review. The final changed fixture hash is recorded
alongside the retained file hashes.

The later bounded fingerprint/drain generation regression in `dev.test.ts` was
independently reread through EOF and its affected native case passes in 708 ms.
It verifies failed candidates and successful replacements retain only active or
draining generation identities, then remove both maps on shutdown. This adds one
distinct case to the earlier native batch: 88 distinct remaining-baseline cases
verified. The two changed retained files have current hashes recorded alongside
the other 35 unchanged retained files.

The coordinator formatted build-support.test.ts and dev.test.ts after the format
gate. Exact previous patch bytes match both accepted raw hashes; new patch
bodies match current bytes. Complete EOF rereads, zero TypeScript parser
diagnostics, identical semantic ASTs and equivalent parser token streams
(normalizing optional trailing commas) confirm formatting-only semantics.
The current rows retain previous raw hashes and semantic/token digests. Existing
native test evidence remains valid; no assertion or behavior changed and no
tests were repeated for formatting. Evidence/source writes are frozen again.
