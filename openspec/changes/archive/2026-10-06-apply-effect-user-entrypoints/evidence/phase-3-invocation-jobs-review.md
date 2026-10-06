# Independent invocation and jobs review

Reviewer: `/root/plan_create_relkit`. The reviewer did not author the reviewed
CLI source or tests. This records review evidence, without changing OpenSpec tasks.

The 48 current authored TypeScript files in
`phase-3-invocation-jobs-review-files.json` were read through EOF and accepted at
the recorded SHA-256 values: 39 source files and nine tests. The original 44-file
frontend/jobs slice is supplemented by the runtime/types/cleanup-presentation
leaves and the cleanup receipt regression. Public/main dispatch, Clack interaction,
scaffold/generator boundaries and every jobs command/SDK leaf are covered.
Implementation files are below 250 lines. Supporting cleanup/error/HTTP and client
SDK sources were read to follow resource and public-error identity ownership.

## Effect and lifecycle assessment

Services retain explicit typed capability requirements; selected domains acquire
lazily within the caller's invocation scope. The covariant command selector wrapper
preserves its actual inferred error/service union. Executed compiler probes check
positive fully supplied consumers, missing authority and erased-environment controls.
Native generator cancellation waits for physical Promise settlement and rollback.
One logger fiber drains a per-invocation queue. The jobs stream has one iterator
owner; its SDK scope calls iterator return once and joins owned fetch cancellation.
Trigger ambiguity and idempotency identities retain existing public behavior.

JSON response and SSE input retain the raw one-MiB bounds. The SSE validator uses
native parser-compatible content types and CR/LF/CRLF event boundaries, including
split CRLF accounting. Raw network bytes are counted before UTF-8/parser expansion.
Library runners use quiet logging. Terminal cleanup records are explicit, bounded
v2 logs beside the primary result; native messages, paths and stack traces stay out
of telemetry dimensions and cleanup presentation. Object-owned inspection receipts
retain the actual original causes without changing enumerable public shapes.

Installed stable Effect 4.0.1 service/Scope/Layer/Stream/cancellation sources and
examples were inspected; unavailable vendor core files were a recorded checkout
gap, resolved through installed source. Installed oRPC client/shared and native
SSE parser source were inspected for MIME handling, iterator and abort ownership.

## Findings resolved before acceptance

1. Independently callable invocation/scaffold/jobs workflows had spans but lacked
   the shared execution observer. They now record fixed bounded operation labels;
   the standalone jobs metric regression rejects private manifest paths.
2. The SSE size guard only recognized LF and compared MIME too strictly. Native
   decoder-compatible CR/LF/CRLF and normalized MIME handling now preserve raw
   limits, including the LF completing an already ended CR event. New chunked
   mixed-MIME/CR-only and oversized split-CRLF tests pass.
3. Primitive CLI outcomes dropped quiet cleanup evidence at terminal edges. Main
   and standalone dispatch now supply the existing presentation policy, and the
   runtime emits bounded safe v2 cleanup diagnostics while preserving stdout,
   successful/failed exit values and object-owned receipts.
4. The logger collapsed warning/debug/fatal levels. It now maps every level to its
   corresponding Effect logger, retains minimum-level filtering and ordered delivery.

All changed deltas were reread through EOF. No remaining functional finding at
this snapshot. The retained local-create terminal test also received a separate
shorter-flow assertion correction reviewed by `/root/native_gate`.

## Independent checks

```sh
rtk bun x --bun vitest run packages/cli/tests/invocation packages/cli/tests/jobs packages/cli/tests/services/cleanup-receipts.test.ts --maxWorkers=1
```

Combined gate: nine files, 30 tests passed in 21.17 seconds. A strict
TypeScript compiler program compiled all nine actual test bodies with
`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and
`skipLibCheck: false`: zero diagnostics. Earlier retained native jobs command and
identity checks passed eight tests; the final service regressions add the
standalone observation, native SDK fetch bounds, level fidelity and primitive
cleanup diagnostic cases. Compiler-only probe budgets are 20 seconds; native
lifecycle deadlines were not broadened.

The later original-object cleanup presentation correction and sixth receipt case
were independently reread through EOF. The affected six-test receipt suite passes
in 1.86 seconds, and the current nine actual test bodies again compile with zero
strict diagnostics. This adds one distinct regression to the earlier combined
30-test gate: 31 distinct invocation/jobs/receipt cases verified. Current hashes
are recorded; no redundant broad invocation rerun was needed for that narrow delta.

After the final author formatting pass, cli-runtime.ts, cli-cleanup-presentation.ts
and the receipt test were reread through EOF. Their refreshed hashes are accepted;
the six receipt cases pass again in 1.74 seconds and all nine current actual test
bodies compile with zero strict diagnostics. The first ad hoc compiler invocation
incorrectly retained emit-project rootDir/composite and omitted DOM declarations;
the corrected no-emit test harness uses the repository resolution settings,
strict declaration checking and the full required libraries. Those harness-only
diagnostics are superseded by the successful actual-body gate.
