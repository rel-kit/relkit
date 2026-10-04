## 1. Preparation and shared contracts

- [x] 1.1 Refresh authored-file coverage, current checkout guidance and pinned dependencies; verify the 338-file baseline and clean scoped worktree.
- [x] 1.2 Verify selected vendor/installed API patterns and record gaps in design.md; confirm every adopted pattern has implementation, usage and test evidence or an explicit installed-source fallback.
- [x] 1.3 Establish shared lazy operation instrumentation and runtime lifetime contracts; verify standalone success/failure/defect/interruption, observer isolation and logging-context tests.
- [x] 1.4 Capture the existing performance workload baseline; retain commands/environment/results for final comparison.

## 2. Runtime Effect

- [x] 2.1 Compose generation/resource services with replaceable Layers and scoped ownership; verify startup, partial acquisition, interruption, reverse cleanup and idempotent disposal.
- [x] 2.2 Complete clock/trace/bridge/logger/failure operations and companions; verify trace/context compatibility, safe telemetry, configured sinks and child-level isolation.
- [x] 2.3 Migrate all seven runtime suites/helpers, complete file/TSDoc/example review, and pass focused Vitest plus source/test typechecks and formatting.

## 3. Local providers

- [x] 3.1 Refactor shared filesystem/state and jobs store/queue/native/scheduler/admin domains through services; pass durable acknowledgement, lease/retry/idempotency/recovery/cleanup tests.
- [x] 3.2 Refactor event log/router/delivery/admin domains; pass independent fan-out, at-least-once, ephemeral drop-newest, overflow and scoped-worker tests.
- [x] 3.3 Refactor cache and bucket domains with explicit storage/configuration; pass public error, byte-LRU/TTL/single-flight, confinement/integrity and pagination tests.
- [x] 3.4 Refactor realtime and agent-state domains; pass cross-process locking, polling cleanup, fencing, receipts, continuation and shared-state tests.
- [x] 3.5 Migrate all 18 provider suites/helpers, complete every file's types/schema/TSDoc review and checked examples; pass focused Vitest, typechecks and formatting, including Layer substitution and standalone telemetry.

## 4. Engine

- [x] 4.1 Refactor generation/admission and registry/provider acquisition through services; pass FIFO, abort/release races, validation/readiness and reverse finalization tests.
- [x] 4.2 Refactor invocation/context/dependency/stream/lifecycle composition; pass validation/hooks/recursion, context inheritance, stream lifetime and compatibility tests.
- [x] 4.3 Refactor event/job materialization and task execution; pass persisted retries, task envelopes, durable suspension and nonterminal hook/metric tests.
- [x] 4.4 Migrate all 15 engine suites/helpers, complete every file's types/schema/TSDoc review and checked examples; pass focused Vitest, typechecks and formatting, including Layer substitution and standalone telemetry.

## 5. Hono runtime

- [x] 5.1 Refactor HTTP mapping/middleware/security/request/body lifecycle domains; pass routing, onion order, validation, authorization and terminal-span tests.
- [x] 5.2 Refactor agent admission/execution/approval/control/journal/protocol domains; pass accepted-run survival, continuation receipts, restart/resume, generation retirement and supervision tests.
- [x] 5.3 Refactor jobs/realtime/limits/static/MCP domains; pass per-frame grants, cursor scope, backpressure, transport compatibility and interruption tests.
- [x] 5.4 Migrate all 33 Hono suites and two helpers with supervised Bun fixtures where required; pass original transport scenarios using Vitest assertions.
- [x] 5.5 Complete every file's types/schema/TSDoc review and checked examples; pass focused typechecks/formatting, Layer substitution, standalone telemetry and child logging tests.

## 6. Integration and completion

- [x] 6.1 Integrate packages in runtime-effect → providers-local → engine → runtime-hono order; update direct pinned dependencies, explicit jobs/MCP runners, moved fixture imports and authored docs; verify install and affected command discovery.
- [x] 6.2 Run repository verification, phase-zero, public declaration/sink and strict OpenSpec checks; record exact passes/failures/skips and unavailable environment-dependent gates.
- [x] 6.3 Compare performance against baseline and investigate median overhead above 5% or p95 above 10%; document measured results and limitations.
- [x] 6.4 Audit all authored files/new companions and changed traversals/background tasks against use-effect and vendor evidence; verify final diff and report coverage, checks, exclusions/blockers and elapsed time with all changes uncommitted.

## 7. Final acceptance in the primary checkout

The preceding tasks record implementation and investigation in the managed worktree. These follow-up tasks record final acceptance in the primary checkout.

- [x] 7.1 Resolve the repository line-limit and public-authoring documentation failures; pass repository verification and documentation checks.
- [x] 7.2 Reduce invocation and HTTP overhead while retaining named service operations, complete instrumentation, logging configuration and lifecycle behavior; repeat an alternating comparison against the unchanged HEAD baseline and record the result.
- [x] 7.3 Resolve the pinned Effect MQ LISTEN compatibility mismatch with focused regression coverage and no dependency upgrade.
- [x] 7.4 Diagnose and resolve packed-project dev/HMR failures; pass account-free Docker release readiness with owned fixture cleanup.
- [x] 7.5 Run final affected acceptance, strict OpenSpec validation and diff review; update evidence, remaining limitations, coverage and elapsed time.
