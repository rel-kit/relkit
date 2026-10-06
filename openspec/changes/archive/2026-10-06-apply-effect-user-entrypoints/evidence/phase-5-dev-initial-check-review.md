# Independent initial development check review

Author: `/root/startup_author`. Reviewer: `/root/startup_reviewer`. All seven
changed TypeScript files were independently read completely through EOF after
the author froze the final source. Independently computed hashes and line counts
match every accepted entry in `phase-5-dev-initial-check-files.json`. The four
production files remain below 250 lines. This acceptance covers source correctness
and the recorded focused checks; packed readiness and full verification are
separate acceptance gates.

## Problem and behavioral result

The pre-session development check ran synchronous TypeScript work on the CLI
event loop. A cold packed diagnostic trace measured approximately 29.30 seconds
in that work. SIGTERM could not be handled until the blocking operation returned.
The initial check now calls the explicit `CliProject.checkDevelopment` capability,
whose live implementation reuses the existing isolated compiler process owner.
The parent can handle interruption while the compiler is busy, and completion
joins the compiler and its owned descendants.

The ordinary project check remains unchanged. Initial checks still use a fresh
generation identity and complete before retention validation, telemetry history
import, local generation resources, or session acquisition. A failed check keeps
the existing `RELKIT_DEV_COMPILE_FAILED` diagnostic mapping. Unexpected worker
spawn/transport failures retain the isolated adapter's typed `CliAdapterError`
identity before admission. No compiler result cache, omitted check, readiness
timeout change, shutdown timeout change, or telemetry sampling is introduced.

Default inspector discovery now derives its module directory with
`fileURLToPath(new URL(".", import.meta.url))`. This retains the existing source,
packaged, and explicit override selection while working under the Node test
runtime as well as Bun.

## Effect and ownership review

- The command invokes the captured Context service; deterministic Layers can
  substitute the same capability. Layer acquisition remains finite and does not
  start compilation. The live project implementation captures the existing
  cleanup service and delegates to the named, observed compiler operation.
- The existing isolated helper owns one process group in `Effect.scoped` and
  `Effect.acquireRelease`. Each request retains independent Ref/Deferred state,
  validates private IPC with the existing Schema, bounds stderr, terminates the
  group on interruption, joins compiler exit, and removes its listeners.
- Ordinary asynchronous waiting remains interruptible. Only the existing short
  acquisition/registration and release regions retain masking. The native CPU
  work has a physical process owner rather than merely an Effect fiber wrapper.
  No Scope/resource escapes and no second termination authority is added.
- Existing execution observation remains at the delegated operation, avoiding a
  duplicate project-level counter. Retention, session fibers, activation ordering,
  stale rejection, draining, and generation compilation remain unchanged. Cache
  and RcMap are inappropriate for this finite per-request ownership correction.
- Deterministic interruption uses Deferred barriers rather than sleeps. The
  native test uses an atomic, Schema-validated readiness marker, then verifies
  actual CLI exit 143, compiler/descendant disappearance, elapsed time below
  two seconds, and absence of `.relkit` telemetry/session artifacts.

## Findings resolved

The first test graph merged a live filesystem Layer after its forbidden fake.
Installed Context merge semantics permit the later service to override the fake.
The author replaced that composition with explicit forbidden session, telemetry,
watcher, probe, filesystem and compiler adapters, without duplicate service tags.

The native timeout assertion initially awaited output before reaching cleanup,
which could hang if the child missed its deadline. The corrected test asserts a
finite exit first and measures the deadline again after both owned PIDs disappear.
Fixture release uses nested try/finally, recovers the private readiness receipt
when necessary, attempts every owned PID cleanup, ignores only the benign ESRCH
exit race, joins readers, and always removes its owned directory. The reviewer
read both corrected tests through EOF. No review finding remains open.

## Focused verification and packed proof limits

The reviewer inspected these author-run final logs; the reviewer did not run a
competing heavy workload:

- `/tmp/relkit-effect-startup-strict-types-final.log`: all seven actual source/test
  files and complete test bodies, zero strict diagnostics.
- `/tmp/relkit-effect-startup-service-type-tests.log`: four Node service cases and
  two strict negative/composition cases, six passed.
- `/tmp/relkit-effect-startup-initial-native-final.log`: final initial-command
  cancellation case, one passed, eight assertions, 1.67 seconds for the suite.
- `/tmp/relkit-effect-startup-native-final.log`: the four unchanged isolated
  compiler diagnostic, crash, descendant release, and CPU cancellation cases
  passed. Its earlier initial-command run is superseded by the final log above.
- `/tmp/relkit-effect-startup-inspector-watch-final.log`: fourteen development and
  inspector cases passed, 141 assertions.

Temporary installed-consumer experiments distinguish cancellation correctness
from throughput. Worker isolation alone passed the first strict session with
readiness around 14.4 seconds and exit 143 around 433 milliseconds. Its second
session still missed the unchanged 30-second readiness gate: initial check
8.50 seconds, generation check 13.67 seconds, local work 3.74 seconds, and build
0.55 seconds completed around 29.24 seconds; shutdown returned 143 around
251 milliseconds. The byte-restored original subsequently passed both startup
and shutdown comparisons on the same host, retaining its history and exercising
an existing live route. That comparison is not a fresh packed scaffold replay.
These pressure-sensitive measurements do not prove a throughput improvement
or completion of the immutable source-packed gate.
The accepted fix addresses actual initial-check interruption and ownership;
the real packed release and full repository verification must establish their
own final outcomes.

## Reference evidence

Review applied `use-effect`, the repository Effect skill, services/layers,
contracts/testing, lifecycle, and structural guidance. Installed Effect is
4.0.1. Inspected implementation includes src/internal/effect.ts 4134–4155
(scoped acquire/release and captured finalizer Context), src/Deferred.ts 174–187
(interruptible waiter registration/removal), and src/Layer.ts 1584–1601
(parallel layer build and ordered Context merging). Documented examples in
src/Effect.ts 13113–13190 and src/Context.ts 1815–1838 were inspected. Exact
version-matched upstream Effect.test.ts in
`/tmp/relkit-effect-4.0.1-Effect.test.ts` at 2254–2337 and 4077–4134 covers
interruption/release and named function transforms. The read-only vendor checkout
is partial and lacks those core implementation/test files and its AGENTS/LLMS
guides. That gap was verified; no vendor content was edited or installed.
