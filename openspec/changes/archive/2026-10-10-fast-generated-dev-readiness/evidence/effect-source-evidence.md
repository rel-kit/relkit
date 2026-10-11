# Effect source evidence — implementation in progress

Pinned runtime: Effect 4.0.1, Bun 1.3.10. The local reference checkout is read-only.
Its relevant core implementation files and Cause/Effect/Scope test files are absent;
installed 4.0.1 sources and embedded checked examples supply those gaps. The
reference `StackCapture.test.ts`, Schema compiler/JIT tests and HTTP tests remain
available and were inspected. The absence statement applies to the listed core
files, not to every test in the checkout.

| Pattern                             | Implementation and examples inspected                                                                                                                             | Behavioral coverage                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service-owned construction / Layers | Installed `Context.ts:201–405`, `Layer.ts:1345–1460`                                                                                                              | Injected snapshot file, dependency, publication and benchmark Layers                                                                                                 |
| Scoped native ownership             | Installed `internal/effect.ts:4134–4175`; existing `owned-promise.ts` implementation and adapter tests                                                            | Publication cancellation barrier and real stage cleanup; file descriptors release through scoped ownership                                                           |
| Monotonic timing / repeat           | Installed `Clock.ts:250–326`, `Effect.ts:15104–15195`, `Schedule.ts:1546–1575`                                                                                    | Benchmark fake clock includes spawn and complete HTTP body; 499 versus 500 ms boundary                                                                               |
| Typed errors and bounded decoding   | Installed `Data.ts` TaggedError, Schema Struct/Array and pattern/length implementations                                                                           | Malformed, oversized, incompatible, escaped, duplicate and mixed-cohort fixtures                                                                                     |
| Full Cause recovery                 | Installed `Cause.ts:75–77,340–364`, `internal/effect.ts:148–170`                                                                                                  | Optional public copy and publication collision recover only a singleton expected failure; mixed siblings refail unchanged                                            |
| Deferred barriers and fiber joining | Installed `Deferred.ts:146–193`, `Fiber.ts:348–380`, `internal/effect.ts:889–917`; reference `http/Template.test.ts:18–38`, `http/HttpMiddleware.test.ts:326–345` | Publication cancellation waits for stage release before returning                                                                                                    |
| Paginated authorized streams        | Installed `Stream.ts` paginate, unwrap, mapEffect and provide implementations/examples; reference `http/Multipart.test.ts:26–48`                                  | Agent service, real network and protocol replay tests                                                                                                                |
| Operation instrumentation           | Existing `observeExecution` owner and `ExecutionSuccessLogs`; installed logging reference examples                                                                | Snapshot member successes are Debug while metrics/failures and owning validation outcomes remain observed                                                            |
| Complete failure translation        | Installed `Cause.ts:658–725` embedded mapping examples and `internal/effect.ts:242–264` delegate; `mapError` delegate was checked for mixed-Cause loss            | `map-error-cause.test.ts` proves multiple Fail translation, retained Die/Interrupt identity, annotations, unchanged success and exact request requirements           |
| Executable cancellation             | Installed `Runtime.ts:120–223` and Node-compatible `NodeRuntime.ts` signal/fiber ownership; the harness uses its existing Promise edge with an AbortSignal        | `benchmark-cancellation.test.ts` launches a real Bun driver, sends SIGINT/SIGTERM, joins exit and verifies the detached measured child is gone                       |
| Single JSON boundary                | Installed `Schema.fromJsonString` and SchemaGetter JSON implementations/examples; available reference Schema compiler/JIT tests                                   | `json.test.ts` verifies exact decoding, decoding requirements and mixed-Cause preservation without a preliminary recursive JSON walk                                 |
| Optional checker authority          | Installed `Effect.serviceOption` implementation and checked examples, plus Context service acquisition inspected above                                            | Compiler journal tests retain ordinary ancestor resolution while isolated preparation rejects it; CLI captures the actual same-check journal                         |
| Current-check receipt reuse         | Installed `Context.ts:201–405`, `Layer.ts:1345–1460`, Schema struct/array checks and selective typed-failure recovery inspected above                             | Default CLI check records one atomic root-free receipt; preparation reuses only exact input/tool/query/manifest evidence and otherwise runs the full check           |
| Public namespace identity           | Installed Effect 4.0.1 `src/index.ts` namespace and Function reexports, with their already inspected leaf implementations                                         | Real Bun packaging test proves `Effect.runPromise` and `Context.Service` identity across named/owner imports and executes a supplied Layer through the bundled child |

2026-10-09 focused verification:

- Snapshot, mixed-Cause translation and telemetry handoff: 18 files, 50 tests passed.
- Default retention byte bound, query-visible overflow, eventual persistence and
  native cancellation: 3 files, 11 tests passed after the additional assertions.
- CLI source TypeScript check passed after the failure-translation changes.

These results complete tasks 5.1 and 5.2. They do not certify persistence startup,
the full shutdown/fault matrix, deferred application routes, or timing acceptance.

Additional 2026-10-09 verification:

- `bunx --no-install vitest run packages/compiler/tests/typecheck-inputs.test.ts
packages/cli/tests/dev-snapshot packages/cli/tests/services/map-error-cause.test.ts`:
  20 files, 61 tests passed. Tests cover preserved-timestamp declaration edits,
  added resolution shadows, global type directories, deletion, escaped parents,
  changed bytes between checking/capture, legitimate builtin colon probes,
  project-root aliases, bounded decoding and joined single-pass inventories.
- `bun test tests/compiler/effect-import-bundling.test.ts`: 2 tests passed,
  including a real joined Bun child. Unsupported/empty/namespace imports retain
  the original resolution path; accepted named imports preserve public identity.
- Compiler build, CLI source TypeScript checks and the repository `prepush` gate
  passed. The final prepush rerun includes the formatted split test fixture.
- Formatted authored TypeScript bounds were measured across 262 changed/new
  files: no file exceeds 200 lines and no function exceeds 49 code lines.
  This size measurement is not the final semantic review through EOF.

The compiler host journal follows TypeScript 5.9.3's actual source reads,
`fileExists`, `directoryExists` and sorted `getDirectories` callbacks (native
directory enumeration implementation was inspected). Prepared tsconfig eligibility
restricts root selection to the generated authored inventory and the explicit
generated route assertion; broader root globs and inheritance are ineligible.
Consumed reads prove positive file/ancestor-directory queries; a retained absent
directory proves nested absence. Other negative queries remain in the receipt
and are replayed before reuse. Identical source/checker/runtime members are hashed
once and checked against every original owner cohort.

Packed attempts before startup:

- The first checker-journal package failed preparation because colon-containing
  builtin probes were rejected by the member-path codec. No startup samples were
  produced. A separate bounded resolution-path codec and regression tests fixed it.
- The next packed project prepared successfully, but the already-loaded workspace
  probe helper held the previous codec. This also produced no startup samples;
  the retained installed packed project was measured separately afterward.
- The subsequent five-start packed reports are diagnostic failures of the timing
  gate, not certification: checker journal median 834.33275 ms; reduced query
  median 789.823084 ms; single inventory median 779.734 ms. All returned the correct
  generated `/hello` body. Short-start shutdown reports retained/uncommitted early
  telemetry and storage acquisition failure; that lifecycle scenario remains open.

This ledger records inspected sources; it is not a final source audit or evidence
that the startup acceptance gate has passed. Additional APIs and final test/file
audits will be recorded as integration proceeds.

Latest retained-source verification:

- Snapshot/compiler journal/early loss Vitest cohort: 20 files, 59 tests passed.
- `bun test packages/cli/build-support.test.ts
tests/compiler/effect-import-bundling.test.ts`: 8 tests, 33 assertions passed.
- The import-transform helper now lives behind the CLI's declared internal
  tooling boundary; the backend-transform experiment was removed after its
  failed measurements. Its loader selection now uses explicit branches.
- A bounded-body AST scan found one existing 50-line test callback; moving its
  synthetic input fixture outside the callback corrected it. The final size
  scan again reports 262 files and no violations.
- Installed `Semaphore.ts:270–325` implementation and embedded examples were
  inspected while investigating a possible shared process budget. The reference
  checkout has no matching core Semaphore source/test. No semaphore-backed
  integrity worker service has been implemented or certified.

See `implementation-status.md` for retained and withdrawn experiments, exact
timing summaries and the outstanding requirements.

Final retained-source gate reruns on 2026-10-09:

- Current-checkout reconciliation reran the compiler-input/snapshot/mixed-Cause
  cohort: 20 files and 61 tests passed. CLI build-support plus public Effect
  import-identity coverage then passed 8 Bun tests. This evidence supports
  completed tasks 2.1, 2.2, 2.3, 2.5 and 2.6; it does not complete the still-open
  environment/secrecy, current-check-receipt or timing requirements.
- `bun run prepush`: exit 0, including frozen install, formatting/lint,
  public-authoring checks, boundaries, all 53 package typechecks, compiler,
  graph, 83 contract tests and six security tests.
- `openspec validate fast-generated-dev-readiness --strict --no-interactive`:
  exit 0. Task 8.4 is complete; timing certification and implementation remain
  incomplete, as documented in the status report.

Current-check and environment acceptance on 2026-10-09:

- Receipt reuse is an optional optimization around the unchanged check result:
  failures to capture or persist evidence do not change ordinary check success,
  while preparation treats absent, corrupt or stale evidence as a full-check miss.
- The receipt test uses live bounded filesystem adapters, changes a source member,
  changes tool identity and checks persisted bytes for root/environment disclosure.
  Publication starts with a real excluded `.env` secret and scans every published
  byte for the value, its SHA-256 identity and the private staging root.
- The generated server environment test builds once, rejects absent production
  requirements before readiness, then starts that same artifact successfully when
  the required secret and provider URL are supplied only to the runtime child.
- Focused outcomes: 7 Vitest files/18 tests and 3 Bun files/10 tests passed;
  `@relkit/cli` typecheck, targeted formatting and diff whitespace checks passed.
  This completes tasks 2.4 and 2.7 but does not change the failed readiness timing
  gate or certify the remaining combinations.

Final route, capability and certification evidence on 2026-10-10:

- The generated route-import index now derives each HTTP target's emitted entry
  chunk and transitive static closure from Bun's split-bundle metafile. Members
  are normalized under `server/`, checked against the verified immutable artifact
  inventory, and fall back to the shared entry closure only for intentionally
  eager routes.
- Deferred implementation imports use JavaScript's per-generation cached import
  promise as the single-flight barrier. A real split-module fixture proves two
  simultaneous requests initialize once while retaining independent request
  context; a real failing import rejects both waiters without duplicate
  initialization. Candidate cancellation remains owned by the already inspected
  signal-composition and supervisor scopes.
- The shared create capability service normalizes first and performs a pure exact
  table lookup. Interactive choices and headless rejection use the same immutable
  table; unsupported tuples fail before the staged workflow is acquired. This
  adds no new Effect recovery or resource-lifecycle boundary.
- The final changed implementation inventory contains 129 TypeScript files; no
  implementation file exceeds 250 lines. The largest is 228 lines. Service,
  E/R, selective recovery, scoped concurrency, cancellation, instrumentation,
  environment secrecy and header/TSDoc obligations were reviewed through EOF.
- Packed acceptance passed after a current-registry AWS transitive metadata issue
  was resolved with explicit published-version overrides. It proves creation,
  prepared-pointer reuse, corrupt-pointer fallback, the printed no-install flow,
  frozen reinstall, check/typecheck/test/dev/build/start, graph/OpenAPI/reference,
  inspector, first and subsequent `/hello` requests, and bounded cleanup.
- Final timing certification passed all 40 recorded starts. Fresh independent
  installs measured median 412.567146 ms, nearest-rank p95 426.025458 ms and max
  448.075334 ms. Unchanged restarts measured median 402.7976875 ms, p95
  416.239042 ms and max 416.937417 ms. Every outcome was the complete correct
  public response and every unrounded duration was below 500 ms.

The semantic conclusions and required scenario ownership are consolidated in
`source-audit.md` and `fault-matrix.md`. Only the default minimal/no-jobs/no-cloud/
no-deploy/examples-on tuple is published; all other candidates remain rejected
and carry no timing claim.
