# Doctor and production-start implementation

Author: `/root/native_gate`. Status: implementation and focused gates passed; independent root review pending.

Doctor now captures filesystem, module, process, cleanup, generator catalog and native toolchain authority through CliDoctor. Ordered reports, error constructors/codes, JSON output and prerequisite policy are preserved. Finite marker/listener owners release before their checks complete. Injected native runners receive cancellation and physically settle before interruption completes. Structured CLI observation covers independently callable methods without recording secret values or bind inputs. Schema validates owned manifest/report data; pure parsers and formatter leaves remain pure.

Production startup captures built artifacts, port/HTTP and process authority through CliStart. Scoped acquisition requires explicit Scope in the typed API. The public Promise handle transfers one manual Scope to caller-owned stop, native completion or caller abort, with one memoized disposal workflow. Baseline Ref/Deferred state is installed before startup/draining. Graceful stop has bounded SIGKILL/reap and reader deadlines. The physical exited receipt is authoritative, including native signal exits with null exitCode. Cleanup receipts remain inspectable on original results/errors through the shared bounded WeakMap bridge after runtime disposal; primary failure identity and enumerable JSON contracts are retained.

Cache/RcMap add no value to these finite checks or process owners. Health retries are idempotent, clock-controlled and cancellable; no application mutation is retried. Tests replace native authority at the same service contracts, without hiding service or scope requirements.

## Verification

- `rtk bunx vitest run packages/cli/tests/start-doctor --maxWorkers=1`: 10/10 passed, including controlled readiness deadlines/recovery, physical injected callback settlement, cleanup evidence, standalone observation and executed compiler mutation probes. `/tmp/relkit-start-doctor-tests.log`.
- `rtk bun packages/cli/tests/start-doctor/native.acceptance.ts`: 4/4 real Bun cases passed: live caller-owned ready handle/repeated stop; readiness failure/reap; cancellation/error identity/reap; native termination failure retained separately after disposal. `/tmp/relkit-start-doctor-native.log`.
- Strict standalone `tsc --noEmit` over all five test files and their actual source dependency closure, with strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes/skipLibCheck:false: passed. `/tmp/relkit-start-doctor-strict.log`.
- `rtk bun test packages/cli/doctor.test.ts packages/cli/start-built.test.ts`: existing 4/4 passed. `/tmp/relkit-doctor-built-baseline.log`.
- All source implementations are below 250 lines, and this lane is formatted with repository Prettier. Whole CLI/package/root gates remain coordinator-owned during parallel edits.

The compiler consumer checks documentation examples, non-any live dependencies, negative domain/infrastructure requirements and negative startup lifetime. Its deliberate erased start Layer causes both missing-authority assignment and unused negative-expectation diagnostics.

Independent retained native tests subsequently found two compatibility gaps:
general graph validation changed the stale build version diagnostic, and an
authorized custom spawn that inherits stderr exposes no pipe to drain. The final
workflow checks the Schema-narrowed version with the established production
rebuild message before full structural validation. Process cleanup owns only
actual piped streams; inherited terminal output stays borrowed. The new controlled
compatibility test passed (1/1) at `/tmp/relkit-start-compat-effect-final.log`.
The independent reviewer reread all three changed TypeScript files and passed
the affected commands-core build regression (1/1) and real product-runtime
inherited-stderr boundary (1/1). Whole CLI source no-emit and the new actual test
body's strict dependency declaration compilation passed at
`/tmp/relkit-start-compat-{typecheck-final,strict}.log`. Current SHA coverage is 31 TypeScript files
in `phase-3-doctor-start-files.json`; earlier line counts below describe the
original phase freeze.

## Exact authored coverage

- `packages/cli/src/commands/doctor-checks.ts` — Effect service/workflow/native or compatibility edge (212 lines).
- `packages/cli/src/commands/doctor-compat.ts` — Effect service/workflow/native or compatibility edge (202 lines).
- `packages/cli/src/commands/doctor-config.ts` — Effect service/workflow/native or compatibility edge (85 lines).
- `packages/cli/src/commands/doctor-error.ts` — pure contract or Schema (15 lines).
- `packages/cli/src/commands/doctor-native.ts` — Effect service/workflow/native or compatibility edge (98 lines).
- `packages/cli/src/commands/doctor-project.service.ts` — Effect service/workflow/native or compatibility edge (131 lines).
- `packages/cli/src/commands/doctor-roots.ts` — Effect service/workflow/native or compatibility edge (53 lines).
- `packages/cli/src/commands/doctor-support.ts` — pure contract or Schema (90 lines).
- `packages/cli/src/commands/doctor-toolchain.service.ts` — Effect service/workflow/native or compatibility edge (43 lines).
- `packages/cli/src/commands/doctor-toolchain.types.ts` — pure contract or Schema (29 lines).
- `packages/cli/src/commands/doctor.schemas.ts` — pure contract or Schema (23 lines).
- `packages/cli/src/commands/doctor.ts` — Effect service/workflow/native or compatibility edge (82 lines).
- `packages/cli/src/commands/doctor.types.ts` — pure contract or Schema (49 lines).
- `packages/cli/src/commands/start-built-validation.ts` — pure contract or Schema (69 lines).
- `packages/cli/src/commands/start-built-workflow.ts` — Effect service/workflow/native or compatibility edge (214 lines).
- `packages/cli/src/commands/start-built.schemas.ts` — pure contract or Schema (26 lines).
- `packages/cli/src/commands/start-built.ts` — Effect service/workflow/native or compatibility edge (45 lines).
- `packages/cli/src/commands/start-built.types.ts` — pure contract or Schema (22 lines).
- `packages/cli/src/commands/start-health.ts` — Effect service/workflow/native or compatibility edge (61 lines).
- `packages/cli/src/commands/start-native.service.ts` — Effect service/workflow/native or compatibility edge (74 lines).
- `packages/cli/src/commands/start-process.service.ts` — Effect service/workflow/native or compatibility edge (126 lines).
- `packages/cli/src/commands/start-process.types.ts` — pure contract or Schema (10 lines).
- `packages/cli/src/commands/start.service.ts` — Effect service/workflow/native or compatibility edge (136 lines).
- `packages/cli/src/commands/start.ts` — Effect service/workflow/native or compatibility edge (169 lines).
- `packages/cli/src/commands/start.types.ts` — pure contract or Schema (90 lines).
- `packages/cli/tests/start-doctor/domain.test.ts` — test/strict/native verification (226 lines).
- `packages/cli/tests/start-doctor/native-fixture.ts` — test/strict/native verification (70 lines).
- `packages/cli/tests/start-doctor/native.acceptance.ts` — test/strict/native verification (171 lines).
- `packages/cli/tests/start-doctor/observation.test.ts` — test/strict/native verification (55 lines).
- `packages/cli/tests/start-doctor/type-probes.test.ts` — test/strict/native verification (107 lines).
- `packages/cli/tests/start-doctor/compatibility.test.ts` — controlled stale-version and read-order regression.
