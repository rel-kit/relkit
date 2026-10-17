# Release readiness gate repair

## Observed failure

The runner-only change in [PR #121](https://github.com/rel-kit/relkit/pull/121)
did not resolve shared-host latency variation. Both runs returned all 20 exact
responses without cleanup failures:

| Release run                                                                                | Host                       | Slow starts (at least 1,000 ms) | Median       | p95          | Maximum      |
| ------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------- | ------------ | ------------ | ------------ |
| [38954309786](https://github.com/rel-kit/relkit/actions/runs/38954309786/job/117153349197) | Ubuntu ARM                 | 12 / 20                         | 1,005.551 ms | 1,037.009 ms | 1,053.127 ms |
| [38976443609](https://github.com/rel-kit/relkit/actions/runs/38976443609/job/117227070798) | macOS 15, Apple M1 Virtual | 4 / 20                          | 779.902 ms   | 1,465.238 ms | 1,609.263 ms |

The macOS report recorded host load averages of 13.720 / 10.383 / 9.261.
Its four slow starts were 1,254.823, 1,609.263, 1,046.087, and 1,465.238 ms.
The [original failed report](../../openspec/changes/separate-release-readiness-performance/evidence/hosted-failed-fresh.json)
is retained byte-for-byte, SHA-256
`dd8b04fbbc2109d0d95855412a4fac397e9ee8a5496504225fc1c3dd02424164`.
These are performance failures. Correct responses alone do not establish
sub-second performance. No dedicated runner was registered at diagnosis time.

## Corrective policy

Versioning uses free Ubuntu runners and explicitly generates version-2
`candidate-readiness` reports. Admission requires all 20 fresh starts, 20
restarts, and restart preparation to return the complete expected response
within the existing 30-second terminal deadline, without child exits or cleanup
failures. Exact tool/package identities, artifact hashes, the current template
digest, all attempts, and rollback remain required.

The original strict one-second `summary` remains separate from `readiness`.
A slow sample keeps `summary.passed=false` and emits a workflow warning.
No old report is rewritten, re-versioned, or represented as a new measurement.
The optional **Startup performance** workflow and
`bun scripts/certify-create.ts --performance` retain strict certification:
any start at or above 1,000 ms fails. Original reports are retained on success
and failure. This workflow has no release publication permissions or release
admission dependency. Passing a shared host is not a universal latency guarantee.

## Validation

Focused tests cover legacy strict reports, slow measured starts and preparation,
independent functional deadlines, missing attempts, incorrect run indices,
non-finite/negative durations, missing samples, stale identities, unsupported
formats, child exits, cleanup failures, false performance verdicts, and
transaction rollback. Hosted release and registry outcomes are separate evidence
and will be recorded after the follow-up PR is exercised.

Local `bun run prepush` passed with one Turbo/Vitest worker, a 2 GiB Node heap,
and low CPU priority. Focused certification/release tests passed (16 tests),
the package capability suite passed (5 tests), and the benchmark summary suite
passed (3 tests). Strict validation of the OpenSpec change passed.
