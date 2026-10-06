# CLI client/local/deployment/development independent review

Reviewer: `native_gate`. Author: `plan_cli`. **Accepted: 102/102 current exclusive TypeScript
files**, comprising 98 source leaves and four lifecycle tests. No unresolved findings remain.
Every file was read through EOF during the rolling functional review; final semantic deltas and
the manual owner were reread. The final byte anchors, origins and classifications are in
`phase-3-cli-domain-files.json`. All implementation leaves are at or below 250 lines.

Review applies use-effect, repository/external Effect guidance and installed Effect 4.0.1.
The vendor checkout lacks relevant core scope/Ref/Deferred/Queue implementations and tests;
installed sources and version-matched upstream core tests supplied that evidence. Pure parser,
Schema, identity, renderer, reporting and type leaves retain direct computation. They require
no speculative Context service, fiber or RcMap.

## Ownership and behavioral contracts

Selected command Layers capture narrow native capabilities and retain missing-service/Scope
requirements. CLI keeps Clack, public Promise/synchronous boundaries, original failures and exit
statuses, JSON shapes and deployment consent. Each long-lived dev session has one explicit Scope
owner, baseline Ref state before fibers start, and Deferred shutdown/activation coordination.
SDK listener mutations are serialized through a private per-proxy Semaphore and remain owned
until physical completion. Startup and shutdown serialize through the same admission barrier.
Owned output readers, compiler callbacks and subprocess work settle before cleanup escapes.

Activation admission and publication are atomic; stale builds cannot publish, old generations
drain with bounded SDK deadlines, and failed/unpublished candidates release exactly once.
Generation fingerprint evidence is removed after failed acquisition or retired drain and cleared
on shutdown. Source watcher change events are bounded; native first failure has its own bounded
latch, survives a 400-event storm and requests shutdown. Fatal watcher defects retain evidence
and request stop. Every native watcher registration is attempted during release even if another fails.

Cache is limited to existing session-local import/recipe reuse. Success-only TTL and replacing
the Cache instance during invalidation fence late completions; transient failures remain uncached.
RcMap is unsuitable for these values because one session already owns their lifetime. The native
callback bridges preserve SDK/public contracts and acquire no additional orchestration runtime.
Standalone domain operations use the shared observer with fixed safe labels; retained synchronous
health, state witnesses and presentation edges preserve their existing contract.

## Findings resolved

- Client, local dispatch and injected deployment consent now observe standalone execution.
- Compiler/session/recipe factories, inspector output/stop and session waits now observe execution.
- Proxy listen/stop joins physical settlement and serializes competing native mutations.
- Failed candidate/drained generation fingerprints and shutdown history no longer accumulate.
- Temporary worker files register release only after exclusive creation; collision and partial-write
  cleanup retain the original failure and secondary receipts. Root independently reviewed the shared
  filesystem helper, including primitive failure evidence, and passed its four controlled cases.
- Native watcher release attempts all registrations and closes its worker Scope; native and fatal
  worker failures are supervised rather than discarded or lost from the sliding change queue.
- Activation queue admission is masked while each result wait remains interruptible.
- Delayed startup cannot publish inspector/resource handles after stopping; shutdown joins startup.
- Callable documentation now describes purpose, parameters and returns. Independent final AST
  scanning covered 239 named source callables/contracts and found one missed drain summary, which
  was corrected and independently reread. Named type companions and canonical Schemas remain pure.
- The controlled supervisor test originally spread a class instance into a partial object and
  failed strict typing. It now uses Object.assign on the real pure instance, retaining its inherited
  contract, with no environment cast or weakened compiler guard.

Retained baseline limitation: local stop/reset mutates all project instances even when the selected
service plan is narrower, while dry-run filters selection. This was confirmed in the captured
original HEAD and reported to root; it is outside the introduced Effect behavior. Separate Docker
startup/reset consent remains intact.

## Independent verification and frozen bytes

`rtk proxy bunx --bun vitest run` over compiler-bridge, recipe-cache, dev-supervisor and source-watch
tests passed **8/8 cases across four files** (`/tmp/relkit-cli-domain-final-tests.log`). The corrected
supervisor fixture then passed its affected **2/2 cases** independently
(`/tmp/relkit-cli-domain-supervisor-final.log`).

The four actual test bodies compile with strict dependency checking, exact optional properties and
unchecked indexed access; no fake declarations replace implementation bodies:
`/tmp/relkit-cli-domain-final-strict.log`, exit 0. The earlier TS2740 fixture error was fixed rather
than suppressed. Root independently accepted the complete positive/non-any, missing-domain/native/
Scope and mutation probes, including documented provisioning examples. Generator reviewer accepted
all retained top-level CLI tests and relevant real dev regression gates.

All **102/102 final raw SHA-256 hashes** independently match current bytes. A separate comment-free
TypeScript printer comparison verified **101/102 identical code hashes** against the accepted
pre-documentation snapshot. The sole implementation-shape delta is the independently accepted
SupervisorProxy test fixture. The final drain documentation line leaves its code hash unchanged.
This establishes that the final documentation/format pass did not add unreviewed behavior.

Final verification reopened seven watcher files for the unchanged events terminology guard:
`dev-session.ts`, `dev-session.types.ts`, `dev-watch.ts`, `dev-watch.types.ts`,
`source-watch.service.ts`, `source-watch.types.ts` and `source-watch.test.ts`. All seven were
independently reread through EOF. Five changes affect documentation only; the other two rename
the cleanup operation and its expected receipt to `dev.watch.registration.release`. Resource
ownership, bounded event admission, failure supervision and release ordering are unchanged.
The final 102 byte anchors again match all current files. An independent Node-backed
`rtk proxy bunx vitest run --maxWorkers=1 --disableConsoleIntercept
packages/cli/tests/services/source-watch.test.ts` passed **2/2**, exit 0, in
`/tmp/relkit-cli-watcher-overlay-review.log`. The author also passed the unchanged events guard
and watcher batch (6/6). No remaining review finding was introduced by this overlay.

`owned-promise.ts` was also read as supporting context, but belongs to root's shared-service slice;
it is excluded from the exclusive 102 count. Root independently reviews this reviewer's authored
runtime/parser/doctor/start/contributor domains. Generator reviewer covers retained top-level tests,
invocation/jobs and telemetry. Account-free final container/deployment and isolated Docker results
are recorded separately in `phase-5-native-acceptance.md`.

**Evidence freeze:** this reviewer will make no further source, matrix or documentation writes
unless root reopens a concrete finding; combined verification can now compare a stable checkout.

### Packed shutdown acquisition overlay

Root reopened the packed Docker shutdown failure. The CLI adapter now forwards its session and
Effect cancellation into the native candidate only during acquisition, then removes both temporary
signal links after physical settlement. An acquired candidate keeps one termination authority in its
existing stop/dispose owner; the supervisor SDK's public signal contract is unchanged. The complete
115-line `dev-supervisor.service.ts` and new 202-line
`tests/services/dev-candidate-cancellation.test.ts` were independently reread through EOF.

Accepted SHA-256 anchors are `b43860fda2d06ebdbecf791cdd302cd3d6da8f8b9624e43af1a1371c67a16eb6`
and `9b4e7a8956e6f553e673dedc5372bf67a0c05f83b08116f579c06b7cc5235f4a`, respectively.
The independent `rtk proxy bun x --bun vitest run
packages/cli/tests/services/dev-candidate-cancellation.test.ts
packages/cli/tests/services/dev-supervisor.test.ts --maxWorkers=1` gate passed **6/6**, exit 0,
in 2.02 seconds with no skips. The native file-gated release case proves that session abort leaves
an acquired child alive and explicit disposal joins graceful exit 0. Further cases retain the original
pending-acquisition cancellation reason, prevent compilation for already-aborted requests, and join
physical compilation after Effect interruption. Existing listener startup/stop races also pass.
This adds one domain file to the previously accepted 102-file inventory; final packed acceptance
remains a separate gate. No actionable review finding remains in these two files.
