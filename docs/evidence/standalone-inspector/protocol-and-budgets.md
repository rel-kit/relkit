# Protocol and collection budgets

Stage 2 local acceptance completed on 2026-10-24. The complete current
repository/native gates pass. Logs are retained under
`/tmp/relkit-s2-config-20261023-01a1663e/`.

The external installation/boundary matrix now passes: 92 selected samples and
112 independent observations, with zero exceptions. Measured installation
budgets for all 46 profiles are in [the final matrix](final-matrix.json), alongside
raw report hashes and matched historical comparisons. Each ceiling is the maximum
of that profile's cold/warm observations for the exact candidate, manager/layout
and platform. Forbidden paths fail independently of these numeric ceilings.
Complete prepush 12 and uninterrupted full-prepush 9 pass; timings remain
descriptive rather than performance certification.

## Independent identities

| Contract                      | Current identity / behavior                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Standalone package identity   | `@relkit/inspector` 0.1.0; binary `relkit-inspector`; local packed proof, no publication |
| Private UI                    | `@relkit/inspector-ui`; assets packaged by the tool                                      |
| Discovery and handshake       | Inspection protocol 1, independent of package versions                                   |
| Project identity              | SHA-256 of canonical root; no root path in the descriptor                                |
| Session identity              | Fresh UUID v4; survives committed generation replacement                                 |
| Session credential            | 256 random bits, 43-character base64url; server-side authority                           |
| Native/history HTTP contracts | Existing protocol names and version 1 negotiation                                        |
| Observability records         | Existing version 2 records, redacted again after decoding                                |
| Durable replay identity       | Existing receipt key `${sessionId}:${sequence}` committed with records                   |
| Storage                       | Existing DuckDB records/receipts/imports schema and compatibility-column check           |

Stage 2 does not rename or migrate the diagnostic database. It retains
`.relkit/observability/observability.duckdb`; project ownership uses the separate
`.inspection-project.json` marker. Existing receipt storage provides atomic
replay deduplication without conflating span ID with revision identity. Native
readback preserves old records/cursors, repeated span revisions and original
generation attribution (`history-revision-fault-native-1.log`).

## Numeric limits and executed boundaries

| Boundary               | Enforced bound                                        | Scoped evidence                                                                                               |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Early retention count  | Default 2,048; configurable ceiling 65,536            | Exact/one-over cases, `exact-early-stream-limits-2.log`                                                       |
| Early retention bytes  | Default 2,097,152; configurable ceiling 67,108,864    | Complete retained envelopes, exact/one-over cases, same log                                                   |
| Individual record      | At most 1,048,576 bytes including transport allowance | Exact/one-over admission and later-record progress, `capture-exact-bound-green-2.log`                         |
| Collection batch       | At most 256 records / 1,048,576 bytes                 | Complete wire and persistence envelopes, `collection-rebind-green-1.log`, `exact-stream-capture-counts-3.log` |
| Producer pending count | At most 2,048 waiting plus active records             | Blocked-writer count/one-over, `pending-producer-bounds-green.log`                                            |
| Producer pending bytes | At most 4,194,304 waiting plus active bytes           | Exact/one-over and interrupted-flush restoration, `interrupted-queue-bytes-green.log`                         |
| Producer flush         | 100 ms scheduling, with count-triggered batches       | Existing queue timer/flush regressions and bounded batch cases                                                |
| Subscriber count       | Default 64; configured maximum 256                    | Exact/one-over and clamp behavior, `exact-stream-capture-counts-3.log`                                        |
| Subscriber bytes       | At most 1,048,576 per subscriber                      | Full UTF-8 event accounting and reservation release, `stream-bytes.log`                                       |
| Aggregate subscribers  | At most 4,194,304 queued bytes                        | Aggregate admission/release, `stream-bytes.log`                                                               |
| Shutdown               | Five-second flush budget; bounded worker termination  | Virtual and frozen native worker cases, `tool-shutdown-green.log`, `scoped-tool-native.log`                   |

These are measured correctness boundaries, not installation-size or latency
performance claims. Failure evidence is retained; no ceiling or timeout was
raised to make a regression pass. App capture acceptance differs from durable
history acknowledgement. Overflow/gaps and producer loss remain visible in
history status; both trace-list consumers now accept committed-record
invalidations (`trace-invalidation-green-2.log`).

The final full run exposed a separate Node IPC shutdown defect after these scoped
checks. Removing the premature parent disconnect preserves the physical-close
join. Real Node and packed-worker tests now pass (`node-close-events-green.log`,
`node-storage-close-green.log`); the complete current full gate subsequently
passes in `current-prepush-full-9.log`. Historical failures are retained.
