# Verification and completion

## Verify efficiently

- Keep new/refactored tests and helpers under the owning package/app's root
  tests/. Use Vitest with @effect/vitest, normally it.effect, with deterministic
  clocks, layers, and synchronization.
- Test new behavior, changed runtime composition, and applicable failures, finalization,
  interruption, retry bounds, and concurrency even when public behavior is
  preserved. Documentation/type moves alone need no new behavioral tests, but
  cannot satisfy requested runtime implementation or service/error refactoring
  on their own.
- Verify selected-tag recovery leaves other variants visible; defects and
  cancellation are not converted to defaults; retry counts and timeout cleanup
  match policy. Include mixed Fail + Die/Interrupt Causes when composition can
  combine reasons; pure-defect checks alone do not establish selective recovery.
  Check Layer acquisition failures separately from method failures,
  shared acquisition/release counts, and request Context isolation as applicable.
- When implementations share a behavioral contract, reuse the relevant contract
  tests across test and live adapters. Check documented capability differences;
  matching TypeScript shapes alone does not prove substitutability. Exercise
  affected atomicity, serialization, and lifecycle guarantees at the real adapter
  boundary when fakes cannot establish them. Report unavailable/skipped coverage
  accurately; use explicit readiness before advancing time or asserting races.
- Verify live/test Layers implement the same service contract and can be
  substituted at the composition boundary. Exercise shared method instrumentation
  with fake dependencies: standalone service calls, outcomes/metrics/logs,
  scoped cleanup, and child log-level isolation when applicable.
- Review runtime service calls, E/R contracts, boundary translation and recovery
  first; reject a documentation-only result when runtime implementation or
  migration was requested.
  Then review every header for a concrete explanation of ownership and behavior;
  inspect every error payload member for its own useful description. Check
  member-focused examples in harnesses with omitted setup, service-owned make,
  readable branches, and precise types. Scan all authored TypeScript for the
  forbidden unknown keyword, any/opaque-type evasions, nested ternaries, and
  conditional selection of effectful handlers; resolve every in-scope finding.
  Continue with complete documentation, file headers,
  files at most 200 physical lines, function bodies below 50 code lines,
  spacing, type placement, and behavior.
  Verify telemetry for standalone domain calls as well as composed workflows,
  including outcomes and interruption where relevant.
- In that same review, inspect every changed loop/Promise batch/background task
  for appropriate traversal and fiber ownership; direct collection work must be
  genuinely pure, required by a boundary, or justified Effect control flow.
  Verify applicable ordering, concurrency bounds, sibling interruption and
  finalization, and actual log output with the application logger configuration.
  Test relevant levels, structured context, redaction and failure/recovery
  events, not only a forced Debug logger.
- Apply the [concurrency acceptance checks](concurrency-and-coordination.md#deterministic-acceptance)
  to relevant behavior. Assert actual overlap and limits across simultaneous
  calls, failure propagation, permit recovery, message policy, gate semantics,
  and settlement of waiters during shutdown. Import presence is not proof.
- Apply the relevant [code-style acceptance checks](effect-code-style.md#acceptance-alongside-the-existing-core).
  Validate semantics and inference, not import counts. When a full app is requested,
  run its live Layers and actual entry point as well as substituted-layer tests.
- Batch formatting, affected tests, typechecking, and required lint/doc checks.
  Repeat only checks invalidated by changes or unresolved failures.
- Measure file and function lengths after formatting for every new or edited
  authored source file; use the definitions in the code-style and implementation
  references. Prefer existing lint/AST tooling for function bodies. Review header
  and TSDoc substance, not just comment presence. Run the applicable Vitest and
  @effect/vitest tests; naming tests or proposing commands is not execution.
  Fix in-scope violations before claiming completion. If a check is unavailable
  or blocked, report the exact unchecked requirement and reason; never report
  full compliance based only on the skill instructions or inferred results.
