# Independent staged shutdown review

Author: `/root/native_gate`. Independent reviewer: `/root`.
Review completed 2026-10-05 22:04 UTC at the hashes recorded in
`phase-4-native-review-files.json` (six refreshed implementation/type files and one
new regression file; 81 accepted files in that review inventory).

The full packed Docker acceptance reproduced exit 137 twice. A retained full
Billing/Shipping reproduction showed telemetry cleanup reaching its 15-second
deadline while provider-owned event polling still produced records. Direct backend
probes with a healthy controlled collector closed providers in milliseconds.

Reviewed all seven changed files to EOF, including their imports and exports:

- `packages/cli/src/server-runtime/server-runtime.types.ts`
- `packages/cli/src/server-runtime/runtime-shutdown.ts`
- `packages/cli/src/server-runtime/server-runtime.service.ts`
- `packages/cli/src/server-runtime/server-runtime-host.ts`
- `packages/cli/src/commands/build-server.ts`
- `packages/cli/src/commands/build-server-shutdown.ts`
- `packages/cli/tests/server-runtime/telemetry-shutdown.test.ts`

Accepted ownership protocol: stop host workers, drain physical invocation receipts,
release native worker handles, release spans/agent persistence while providers are
open, close application resources and their polling, flush final telemetry, then
close the separate telemetry Scope. Each acquisition has one Scope owner; repeated
shutdown joins the same Deferred/Promise completion. The existing single-callback
shutdown remains compatible, and cleanup failures remain distinct from primary
failure evidence. The optional final flush uses the telemetry deadline. Relevant
Scope, Ref, Deferred, and interruption APIs use the already inspected Effect 4.0.1
implementation and vendor references; no unprovided service environment was added.

Independent root verification: `rtk proxy bun x vitest run
packages/cli/tests/server-runtime/telemetry-shutdown.test.ts` passed both tests with
exit 0. The subsequent complete independent replay, `rtk proxy bun x vitest run
packages/cli/tests/server-runtime --maxWorkers=1`, passed all 27 cases with exit 0
in 6.89 seconds, including the negative service/type probes. Log:
`/tmp/relkit-effect-staged-shutdown-root-review.log`.
The new tests assert actual callback ordering, live provider availability during
persistence release, telemetry availability during provider release, repeated
shutdown ownership, and retention of native provider/final-flush failures. Author
verification reports all 27 runtime cases, four emitter cases, strict source types,
and negative service environment probes passing. Maximum changed implementation
length is 234 lines.

No actionable review finding remains in these seven files. Actual rebuilt full
collector, packed Docker acceptance, complete verification, and synchronization
remain pending; this review does not claim those gates passed.

## Genuine collector follow-up

The staged owner ordering alone still exceeded the existing two-second packed
shutdown grace. A trace using the actual CLI collector measured worker/drain/agent
release at two milliseconds, provider release at six milliseconds, final telemetry
flush at 5,160 milliseconds and exporter closure at 526 milliseconds. The genuine
CLI supplies a 15-second telemetry timeout; the healthy controlled-collector probe
had used the shorter default. The packed grace was preserved.

The follow-up adds an explicitly scoped `ExecutionSuccessLogs` Context Reference,
defaulting to true, to the shared observer. Background provider acquisition and
worker callbacks provide false. Successful observations still update counters,
duration metrics and span outcomes; errors, defects, interruption and application
logs retain their existing behavior. The Promise host carries only this reference
through nested host calls, preserving its own typed service authority. Its external
callback adapter supplies the current native context across asynchronous waits.
Finite initialization work keeps the default completion logging.

Root independently reviewed the host, host types, emitted server and new real SDK
background-observation test to EOF at their current hashes. The authoritative
native review inventory now contains 82 files. The new regression exercises real
local job-store/queue acquisition, callbacks after await, nested worker batches,
metrics, SDK errors and explicit application INFO logs. The root observer/barrel
and policy tests were independently reviewed by `/root/native_gate`; their receipt
is recorded separately in `phase-5-observation-supporting-files.json`.

Independent root verification passed all 100 contracts/runtime cases across 20
files with exit 0 in 7.12 seconds. Contracts strict typechecking, the 34-task CLI
dependency build and the updated frozen installation passed. Logs:
`/tmp/relkit-effect-context-policy-root-tests.log`,
`/tmp/relkit-effect-context-policy-cli-build.log`, and
`/tmp/relkit-effect-contracts-policy-typecheck.log`.
The test-only local-provider dependency uses `workspace:*`; no production
dependency protocol or version was changed by the test fixture.

## Readiness observation follow-up

Fresh immutable registry acceptance also exceeded two seconds when isolated from
the repository build. The earlier concurrent failure therefore cannot be
attributed solely to CPU load. Read-only review found that one readiness request
performs up to 17 private host state reads, contributing 185 successful snapshot
records to an 835-line failed packed log. This is additional avoidable observation
traffic introduced by the internal Effect adapter.

The private synchronous host getter now provides the same false success-log policy
for its pure state reads. Its metrics, spans, synchronous return value, failure
handling and closed snapshot behavior remain intact. Direct service consumers
retain their default logging. Root independently reread the complete 230-line host
and 103-line real SDK regression test to EOF at the refreshed hashes in the
82-file native receipt. The test performs five synchronous reads outside a worker
context and checks successful snapshot metrics plus absence of completion records.
All 30 policy/runtime tests passed with exit 0 in 10.19 seconds, and the 34-task CLI
build passed. Logs: `/tmp/relkit-effect-quiet-state-root-tests.log` and
`/tmp/relkit-effect-quiet-state-cli-build.log`. The two-second packed grace remains
unchanged; immutable acceptance is being recaptured from this final cohort.
