# Independent supporting storage review

Author: `/root/native_gate`. Reviewer: `/root`. All six changed TypeScript files
were read completely through EOF, including the final corrected test fixtures.
Current hashes, line counts, and classifications are in
`phase-5-duckdb-batch-files.json`. No production implementation exceeds 250 lines.

## Problem and result

The unchanged two-second packed development shutdown gate exposed cold collector
backlog. Parameter-bound batch inserts replace two SQL calls per admitted record
with three SQL calls per batch: receipt admission, explicit sequence allocation,
and record insertion. The existing connection permit and transaction remain the
authority for serialization, retention, commit, rollback, and native lifetime.
No records are sampled or dropped and no timeout is relaxed.

The temporary installed-consumer proof passed both strict sessions consecutively
with continuous history, complete telemetry, and the original host receipt policy:
206.57 ms and 234.18 ms, exit 143, with both ports rebound each time. The immutable
source-packed release and complete repository verification remain separate gates.

## Effect and behavioral review

- Named lazy Effect operations preserve the existing tagged DuckdbError channel.
  Every input is validated and redacted before duplicate keys are discarded;
  bounded placeholder SQL binds all values. First-input ownership remains global
  across origins and retries.
- Receipt results are checked against submitted keys. Allocated IDs are checked
  for count, shape, positivity, and uniqueness, then sorted with BigInt comparison.
  Explicit bound IDs associate each admitted input with its cursor without relying
  on native result order or JavaScript number precision.
- The existing Scope owns the connection. The shared semaphore serializes writes
  and queries. Each unchanged SQL wrapper masks interruption until the physical
  native Promise settles; the transaction bracket then rolls back before release.
  No fiber, detached operation, cache, RcMap, or extra service lifetime is added.
  The existing injected driver Context and Schema admission boundary suffice;
  per-batch Maps are temporary computation state, not shared Ref state.
- Commit rejection retains its tagged primary failure and attempts rollback.
  Native tests verify receipt and record rollback, successful retry, the 256-input
  bound, first-wins ownership, and cursors. Deterministic tests exercise shuffled
  results above Number.MAX_SAFE_INTEGER and physical interruption ordering.

## Findings and verification

The first native fixture acquired its directory, instance, and connection before
establishing cleanup. Root requested immediate ownership at each acquisition.
The corrected helper uses nested try/finally and retains every assertion; root
read the final file through EOF and accepted it. The author also fixed required
LogRecord.fields objects exposed by strict compilation of all three test bodies.
No check was suppressed. No review finding remains open.

Independent root verification ran the complete observability suite under Node:
64 files and 181 tests passed, exit 0, in 7.55 seconds. Log:
`/tmp/relkit-effect-duckdb-root-tests.log`. Author source no-emit and strict actual
test bodies passed; final focused native/controlled/concurrency tests passed 14/14.

## Reference evidence

Installed Effect 4.0.1 implementation was inspected in src/internal/effect.ts at
1061–1128 (typed try/tryPromise), 1243–1348 (fn transforms), 4396–4408
(acquireUseRelease), and 4550–4588 (interruption mask). Examples were inspected
in src/Effect.ts at 2393–2460, 13113–13190, 14808–14838, and 22582–22661.
Version-matched upstream tests in `/tmp/relkit-effect-4.0.1-Effect.test.ts` at
473–532, 2254–2337, and 4077–4134 cover those patterns. The read-only vendor
checkout is partial and lacks these core implementation/test files; no vendor
file was edited or installed. Existing duckdb-sql.ts retains the native mask.

DuckDB 1.5 primary documentation was checked for
[parameterized insert and conflict/returning behavior](https://duckdb.org/docs/current/sql/statements/insert.html)
and [explicit nextval allocation](https://duckdb.org/docs/current/sql/statements/create_sequence.html).
Actual pinned native-driver tests validate the chosen SQL; cursor mapping does
not assume returned row order.
