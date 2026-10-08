# Candidate demo acceptance

The existing demo and its retained generated-agent fixture were temporarily
linked to the candidate worktree. The restoration snapshot captures both
projects' manifests, lockfiles, installed symlink targets, global Bun link
registrations, and the three historical evidence files touched by existing
scripts. Fresh results are retained separately under
`/Users/mustafaelsayed/Workspace/relkit-regression-demo/evidence/effect-user-entrypoints-2026-10-05/`.

## Actual candidate results

- Demo check and typecheck passed; the generated-agent fixture typecheck passed.
- Demo tests passed: 12 tests and 25 assertions across 11 files. The initial
  mixed-version fixture failure was resolved by linking the fixture to the same
  candidate cohort before replay; the failed initial command is not counted as
  a pass.
- Live smoke passed all 11 checks; API regressions passed all five checks.
- Real Inspector browser acceptance passed graph, errors, events, buckets,
  requests, declared HTTP failure filtering, and navigation. Its browser session
  was closed after acceptance.
- Graph evidence contains 34 nodes, 36 edges and zero orphan edges; provider
  signed-read/signed-write and durable event delivery evidence is retained.
- Six expected Inspector API endpoints returned 200. The historical individual
  `runtime/events/demo.example-event` URL returned 404; this is not an expected
  endpoint or a newly changed route. A transient request during hot reload was
  replayed after readiness and passed.
- Generated AI acceptance passed all nine checks using its controlled model:
  tools and persistence, AG-UI, invalid input, streaming order and failure,
  cancellation, realtime fanout/replay, WebSocket and malformed parameters.
- Disconnect acceptance passed for iterator return and AbortSignal cancellation:
  each connection count changed from one to zero and remained zero at one and
  five seconds.
- Origin acceptance passed absent-origin and same-origin function requests
  (HTTP 200), plus same-origin WebSocket opening.
- Generated-browser Playwright acceptance passed its same-origin and malformed
  AI/channel input scenario against the candidate fixture.

## Credential-dependent acceptance

Fresh paid Luna scenarios remain pending: `OPENAI_API_KEY` is absent from the
execution environment. Only availability was checked; no secret or historical
credential was read, copied, logged or reused. The controlled-model acceptance
above does not claim the paid replay passed.

## Restoration and adoption

Restoration passed at 2026-10-05T20:57:55.695Z. Both projects' manifests and
lockfiles, all 153 captured project/global symlink targets, and all three
historical evidence files match the original snapshot exactly. Nine file
dispositions were verified, including originally absent lockfiles. The new
dated evidence remains separate. Only the verified candidate-owned demo
process was interrupted; ports 3330 and 3340 no longer have listeners.
User-owned Docker services are preserved. The private restoration receipt is
`/tmp/relkit-effect-demo-restore-D7QqwU/restoration-receipt.json`.

The historical frozen demo Bun metadata points its `relkit` binary at
`dist/index.js`. The candidate has a passive library barrel and declares
`dist/bin.js` as its executable, verified by fresh packed installations. Exact
restoration retains the historical target; adopting this migration in an
existing linked project requires the normal Bun installation/bin-metadata
refresh. This environmental requirement must not be hidden by leaving a changed
demo symlink behind.

## Final runtime replay

After the staged shutdown and scoped background-observation corrections, the
candidate runtime was rebuilt and the retained generated-agent fixture was replayed
against ports 3330 and 3340. All nine controlled-model AI checks passed again.
Iterator return and AbortSignal cancellation each changed connection count from
one to zero and remained zero after five seconds. Fresh evidence is retained in
`evidence/effect-user-entrypoints-2026-10-05/final-runtime-replay/` within the demo.

The exact owned launcher received SIGTERM, exited with the existing accepted
status 143, and its descendant processes and both listening ports were released.
All 153 captured project/global links and nine manifest/lock/history file
dispositions were independently compared to the original snapshot after replay
and matched. The temporary helper is
`/tmp/relkit-effect-demo-links-replay.py`; it validates the snapshot before linking
and after restoration. The paid Luna prerequisite remains pending as stated above.

## Final storage replay

After the reviewed grouped-write correction and successful 34-task CLI dependency
build, the generated-agent fixture was replayed again at 2026-10-06T05:03:52.780Z.
All nine controlled AI cases passed (exit 0, 5.125 seconds), and both disconnect
cases passed (exit 0, 10.534 seconds). Return and AbortSignal cancellation each
left zero connections at the initial sample, one second, and five seconds.

The owned launcher exited 143 after SIGTERM in 43.25 ms. No forced termination or
remaining owned descendant was observed, and both ports were released. The helper
restored 82 changed project links; all 153 project/global link targets and nine
saved file dispositions matched the original snapshot. Root independently reran
the restoration comparison and confirmed the same result. No global registration
or historical evidence was changed, and no paid model call was made.

Fresh evidence and the counts-only replay receipt are retained separately in
`evidence/effect-user-entrypoints-2026-10-05/final-storage-replay/` within the demo.
The replay completed at 2026-10-06T05:04:28.469Z. Its receipt is
`replay-receipt.json` in that directory. Fresh paid Luna acceptance remains pending.

## Final initial-check replay

The final reviewed initial-check correction was replayed without changing any
controlled AI or disconnect scenario. Historical attempts remain separate:

- `final-startup-replay-2026-10-06T062912Z` stopped at preflight. Worktree frozen
  installation had redirected 42 global RELKIT registrations to the candidate.
  Root verified those were the only changes, restored them, and checked all
  153 links and nine saved file dispositions before retrying.
- `final-startup-retry-2026-10-06T073313Z` failed its 90-second readiness deadline
  during concurrent host load. The launcher exited 143 after 809.82 ms, but one
  compiler descendant needed explicit termination. No controlled test ran; both
  ports and all 153 links/nine file dispositions were restored afterward.
- `final-startup-quiet-2026-10-06T0743Z` passed from
  2026-10-06T07:43:34.019Z to 2026-10-06T07:44:39.139Z, after the observed
  competing typecheck/test processes had finished. All nine controlled AI cases
  and both disconnect cases passed. Shutdown exited 143 in 282.42 ms without
  forced termination or remaining owned descendants; both ports were released.
  Root independently verified exact restoration of all 153 links and nine saved
  file dispositions. No paid model call was made.

Each directory is under the existing dated demo evidence directory and retains
its own `replay-receipt.json`. Earlier evidence was not overwritten. The passing
replay covers the final initial-check source; full repository verification and
fresh paid Luna acceptance remain pending.

## Explicit generated browser replay

The generated-browser case was run explicitly against the candidate-linked
AI-validation fixture in `generated-browser-20261006T1306Z`. It passed one test
with zero skipped, failed, or flaky cases, including greeting, malformed AI and
channel inputs, and WebSocket admission. No valid model invocation or paid call
occurred. Receipt: `generated-browser-20261006T1306Z/replay-receipt.json` under
the existing dated evidence directory. Its recorded run was
2026-10-06T13:43:55.597Z through 2026-10-06T13:45:25.938Z.

The reviewed guard normalized only 42 recognized global registrations and
temporarily changed 82 project links. It never wrote the nine saved opaque
manifest/lock/history dispositions. Shutdown physically joined the fixture,
watcher, both output pipes, and owned descendants in 800.452 ms, with exit 143,
no forced kills or remaining groups, and all ports released. Root independently
verified exact restoration of all 153 links and nine saved file dispositions.
Historical replay evidence remains intact. Together with the current repository
browser run, all 34 browser cases now have passing receipts. Full verification,
paid Luna acceptance, and checkout synchronization remain incomplete.

The later unmodified full verification, session 85989, exited 0. Its frozen
install retargeted only 42 recognized global link counterparts. The independently
reviewed guard restored those targets and again verified all 153 links and nine
opaque file dispositions without writing the saved files. Earlier demo, AI,
disconnect, and explicit generated-browser receipts remain valid because the
accepted runtime source has not changed. Fresh API-key presence was still false
at 15:29:16 UTC, so fresh paid Luna scenarios have not run. Synchronization has
not yet occurred. The historical CLI-bin adoption note above still applies.

## Local delivery completed

The verified candidate delta has now been delivered into the original checkout
as unstaged changes. Original frozen installation, full build, typecheck,
boundary checks, strict generator types, and both entry-point package suites
passed. Root and independent checks verified byte/mode equality and both
deletions, with HEAD and empty indexes preserved. These results supersede the
earlier synchronization status; historical evidence remains intact.

After original installation, the reviewed guard found zero deviations and
verified all 153 demo links and nine opaque saved file dispositions without
rewriting them. The earlier check/typecheck/test, live, inspector, graph,
AI-validation, disconnect, and explicit browser receipts still cover the frozen
runtime source. Fresh paid Luna scenarios remain outstanding because API-key
presence is false. The existing demo's historical CLI-bin target remains
restored; run its normal `bun install` when adopting the new `dist/bin.js` entry
point, as described above.

## Fresh paid Luna replay completed

The user supplied a fresh execution-environment key via the demo's `.env`.
Model access returned 200, and both unchanged paid probes passed against the
temporary candidate links. Fresh replay session 99053 ran from
2026-10-06T18:34:01.804Z through 2026-10-06T18:34:27.494Z. Its separate evidence
directory is `paid-luna-20261006T1830Z` under the existing dated evidence owner;
no historical result was replaced.

The direct demo declaration returned exactly `Luna demo verified.` without
invoking a write tool. The generated host performed the greeting lookup,
streamed tool-call results and `RUN_FINISHED` without `RUN_ERROR`, and persisted
a succeeded run containing `Hello, Validation!`. It observed 60 chunks, first
SSE chunk at 76 ms, and total streamed execution of 5914 ms. The original
model/request/readiness/shutdown limits remain unchanged.

Shutdown exited 143 and physically joined the generated host, output pipes,
watcher, and owned descendants in 575.682 ms, without forced kills or cleanup
signals. All replay ports were released. Exact restoration verified all 153
links and nine opaque file dispositions; all 82 temporary project links were
restored. The user's `.env` remained byte-identical and the private evidence
scan found no credential occurrences. Root independently repeated restoration
and local-delivery verification. This closes the remaining task 5.2; all 20
tasks are complete. Earlier missing-key and incomplete acceptance statements
are retained as historical checkpoints. The historical CLI-bin adoption note
still applies when refreshing the demo's normal installation.
