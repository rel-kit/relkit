# Guidance evaluation: source behavior and distribution limits

Date: 2026-10-18. The source skill SHA-256 supplied to the evaluator was
`b3e77a015b0431664f723543f2b5792dcd1f59936e05897f5517424dcff17180`.
The available agent evaluation path was a single skill-creator forward-test
subagent using disposable applications. No new evaluation platform was added.
Its specific runtime model identifier/version was unavailable; its reported
generic identity was GPT-6. This is an explicit provenance gap, not an exact
model/version claim.

The evaluator read the actual source skill and relevant references, without the
parent's rubric or conclusions. Literal requests, actual responses, observed
actions, diffs, before/after hashes and finite test logs are preserved under
[guidance-forward](independent/guidance-forward/REPORT.md). The evidence copy
excludes dependency symlinks, node_modules, Git internals and generated .relkit
state. Original fixtures were disposable and are not independent packed proof.

## Parent assessment

Pass means the stated narrow behavior was observed in the transcript and file
evidence. It does not mean an application passed its complete runtime gates.

| Cases | Concrete rubric                                                                                                                        | Observed result                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Ask database/driver and auth together before application writes                                                                        | Pass: one combined question; no application created                                                                                                                       |
| 02–03 | Reuse explicit choices; no repeat onboarding; no database for explicit no-DB                                                           | Pass: actual supported create/add commands; no extra authorization prompt; verification explicitly skipped                                                                |
| 04    | Resolve persistent-auth versus no-database conflict before writes                                                                      | Pass: conflict stated; no app created                                                                                                                                     |
| 05    | Reproduce original route-boundary bug before changing it, explain fix, replay invalid/valid cases                                      | Pass for supplied Request/Response handler: two tests, 17 assertions; no complete generated-server claim                                                                  |
| 06    | Plan then implement requested feature with service/route placement and input schema                                                    | Pass for source/direct invocation: one test, four assertions; HTTP runtime explicitly blocked                                                                             |
| 07    | Discussion changes zero application files                                                                                              | Pass: unchanged hashes and empty application diff                                                                                                                         |
| 08    | Keep discussion read-only while implementing the separately requested bug fix                                                          | Pass for supplied handler: two tests, 17 assertions                                                                                                                       |
| 09    | Explain optional realtime benefit without silently adding it; keep internal storage private                                            | Pass: storage and SQL only; no public database endpoint or realtime files; one SQLite test, six assertions                                                                |
| 10    | Requested realtime requires only missing provider/config decisions                                                                     | Pass: provider/access questions, no repeated include-realtime approval; no premature writes                                                                               |
| 11    | Separate users/orders contracts, own service/route paths, session-based ownership; preserve auth handler; no frontend/table dispatcher | Partial: source structure and isolated SQLite/session-fake tests pass (nine assertions); real auth/HTTP valid-invalid and denied-allowed route acceptance absent          |
| 12    | Reuse existing auth/history; ask only an unresolved feature decision                                                                   | Pass: auth and migration bytes unchanged                                                                                                                                  |
| 13    | Preserve explicitly selected fullstack and existing frontend                                                                           | Preservation pass, implementation coverage incomplete: request had no concrete feature; clarification and unchanged web/page.tsx do not prove delivered frontend behavior |
| 14    | Separate suspected cause from unavailable reproduction; attempt verification and disclose failure                                      | Pass for honest reporting: before/after loader failures retained; static fix and tests explicitly unverified                                                              |

Seven finite tests with 53 assertions passed across the live evaluation cases.
Case 14 did not pass tests. No build, typecheck, browser, listener, container or
watcher was run by the evaluator. These are actual constrained evaluations,
not invented successful transcripts or keyword-presence assertions.

Tasks 5.1, 5.2 and 5.4 have the narrow representative evidence above. Task 5.3
remains open for real protected-resource HTTP checks and concrete fullstack
feature behavior. Task 5.5 remains open for exact model provenance, complete
behavior matrix and final packed-skill identity.

## Distribution gap

At evaluation time the installed create executable embedded the baseline skill
hash `6854a26c3a6b12e20dcea9fc77cb33423f6151db046906f7e762f7e0e5963482`,
and its add command copied the old migration script. Those observed artifacts
are retained honestly; they do not prove the updated distribution.

After that observation the generator was compiled and its templates/patch assets
were regenerated with the repository's existing pack-template script. Source
parity and local generated-tooling checks passed. A new independent packed
consumer and refreshed public certification are still required. Historical
creation evidence was not relabeled and no public tuple was promoted.
