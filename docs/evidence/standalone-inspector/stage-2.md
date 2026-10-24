# Stage 2 implementation evidence

Status (2026-10-24): **Accepted locally; 29/29 Stage 2 tasks closed.**
Stage 1 remains accepted at 39/39. All 68 implementation/acceptance tasks are
closed. Required local runtime, final-isolation, review and cleanup gates pass;
hosted CI, cloud acceptance and publication are separate evidence.

## Evidence ownership

Commands and every retained failure are under
`/tmp/relkit-s2-config-20261023-01a1663e/`.
Earlier observations are preserved verbatim in
[implementation checkpoints](implementation-checkpoints.md) and
[verification checkpoints](verification-checkpoints.md). Their pending-status
statements describe their original checkpoint, not current acceptance.
Current review fixes and newly executed gates are in
[review checkpoints](review-checkpoints.md).
Protocol identities and exact collection limits are in
[protocol and budgets](protocol-and-budgets.md).

## Configuration and production: 11.1 / 11.2 closed

Shared contracts normalize omitted inspection or `{ enabled: false }` to disabled and enabled
inspection to a private bridge on `127.0.0.1:0`. The UI separately defaults to 3210. Obsolete `inspector.port` and development UI-port flags give correction
guidance. Doctor probes backend/fixed selected bridge ports, not the tool UI.

S2.1 C1 passes, 22 cases (`s21-c1-current.log`). A real generated production
application also passes 11 assertions with explicit development inspection,
legacy/internal environment overrides and attempted session credentials:
business HTTP and core liveness work; authenticated core graph works; rich
runtime/actions/history are absent; no descriptor or DuckDB file is created
(`generated-production-isolation-2.log`). Generated registration excludes rich
production inspection. Template certification now passes fresh/restart 20 samples
each, p95 490/496 ms (`creation-certification-current-1.log`); the producer owns
the updated digest and reports. Installed CLI acceptance passes 80 assertions
(`generator-installed-lean-2.log`). An available tool with omitted inspection
passes seven native assertions (`installed-tool-disabled-native-2.log`).

Descriptor C1 and config/transport checks pass 27 cases (`config-files-c1-current.log`).
Native discovery passes zero/one/multiple, stale/current-PID, incompatible and
target-override cases, without deleting foreign descriptors: three cases/eight
assertions (`discovery-native-current.log`). These close 14.2 and 14.3.

## Bridge, capture and session ownership

The CLI owns no Next UI, DuckDB store or storage worker. Ordinary and prepared
development use bounded memory capture and a session bridge. Validated reloads
retain listener/token/descriptor identity; rejected candidates leave the active
target unchanged. Full restart rotates identity. Disabled inspection acquires
no listener, producer ingress or retention buffer; bind failure preserves app
readiness. Prepared receipts contain configuration, not reusable credentials.

| Scoped evidence                                           | Observed result / retained log                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Files, origin/Host/auth/project/session fences            | Private publication/cleanup and adversarial cases pass; `connection*.log`                        |
| Real dev, reload, rejection, restart, bind failure        | Native cases pass; `dev-bridge-native-2.log`                                                     |
| Prepared startup, traffic drain, watch, logging, shutdown | 15 cases / 82 assertions; `current-prepared-ownership.log`                                       |
| Real generated app to capture/bridge/tool/history         | Graph, correlated logs/traces, reload and independent lifetimes; `generated-app-graph.log`       |
| Producer redaction/context/oversize loss                  | `capture-context-native.log`, `cli-json-producer.log`                                            |
| Stable replay/prefix ACK/concurrent arrival/config        | Capture and handoff suites pass; `capture-handoff*.log`                                          |
| Native response EOF/cancel/drain ownership                | Three cases pass; `response-scope-native.log`                                                    |
| BFF auth, target containment, SSE and history codecs      | Ten cases pass; `backend-history-probes.log`                                                     |
| Mixed failures, defects and bounded history recovery      | Seven cases pass; `mixed-cause-recovery-green.log`                                               |
| Subscriber byte/count/aggregate reservations              | Seven cases pass; `stream-bytes.log`                                                             |
| UI/history concurrent shutdown deadline                   | Virtual and actual frozen-worker cases pass; `tool-shutdown-green.log`, `scoped-tool-native.log` |

Session C1 native/prepared ownership and current certification close 13.1–13.4.
Current Inspector API and security gates close the remaining bridge tasks.
History/fault/exact-bound C1 evidence closes 15.1–15.4. Current complete browser
and ordinary/prepared recovery acceptance closes 15.5
(`unvisited-test-inspector-browser-12.log`). Retired implementations/tests moved
to their current owners.

## Distribution: 12.1–12.3 closed

Private UI is `@relkit/inspector-ui`; publishable tool is `@relkit/inspector`
0.1.0 with `relkit-inspector`. The tool owns Node UI, collector and optional
native store; required runtimes are Bun >=1.3.10 and Node >=20.9.0. Turbo orders
the private UI before packaging and includes producer inputs in its cache graph.
Three current distribution cases pass (`distribution-current-a3.log`).

The fresh final candidate contains 56 verified archives under
`/tmp/relkit-stage2-final-20261023-0PpISL/artifacts`; manifest SHA-256 is
`c686611dc7024d2f1a813736de19d5cf087678da376f912b1b9475593d3fd461`.
Tool SHA-256 is `f96a472677f98c17d498beba87f6443e049b0885f33bf9c68d18e50c1b250601`.
Current external proof passes isolated installation, installed Bunx/Npx help,
real UI/history, redaction, cache deletion and history-preserving restart,
tool uninstall while the backend continues, and independent CLI installation:
66 physical instances, no missing requirement and zero final-policy forbidden
paths (`final-standalone-2.log`, `final-standalone/result.json`). Owned UI,
worker, backend, registry and successful external fixture cleanup complete.
These results close 12.3; the candidate-wide final matrix is recorded below.

The earlier packer validated 56 actual archives, including manifest/export
contracts, required UI/static files, license bytes and the CLI's absence of
retired UI/store payloads. Earlier scoped candidate:
`/tmp/relkit-stage2-probe-20261023-a3/artifacts`.
Tool archive `relkit-inspector-0.1.0.tgz`, SHA-256:
`c66a083834a85255d552eefda7c821432b050de5b1da08a270a19966fe58b5b8`.
Native execution has been exercised on macOS arm64 and Linux arm64; other
platforms have no evidence here.

The earlier external candidate A1 passed isolated Bun installation outside the
checkout, installed `bunx --no-install` and `npx --no-install` help, packaged
UI/native history, live graph and redaction, cache removal/restart with identical
history, and tool uninstall with the backend still serving. Separate CLI install
had 66 physical package instances, no missing requirements and zero forbidden
paths under final policy with zero exceptions. Full graph:
`/tmp/relkit-stage2-probe-20261023-a1/external-report/result.json`.
Log: `standalone-external-probe-a1.log`. This is not the final candidate-wide
installation/measurement matrix or public-registry runner proof.

## Browser and history views

The browser owner now launches the actual standalone package and its history
worker. Resource pagination/previews, cache, graphs, agent chat, human-input
resume and thread history pass (`standalone-browser-3.log`). Expanded persisted
log, request/trace correlation and generation-bound job retry pass
(`standalone-history-browser-6.log`). UI unit suite: 67 cases / 310 assertions
(`ui-history-unit-2.log`).

Historical views disclose bounded/incomplete history, disconnected/ambiguous
selection and unavailable storage. Recovery names the Inspector rather than
restarting the backend. App capture acceptance is distinct from durable history.

Retained browser failures include an undeclared fixture adapter import, a
text-versus-accessible-label wait, and January fixture records correctly expired
by the store. Browser fixtures now use the current clock; retention is unchanged.
The real agent RPC path initially lacked a generation fence (`409`); responses
now identify the serving generation and native controls carry that observed ID.
Twelve bridge security and three UI generation cases pass. Lost mutation
responses are not retried. A manual diagnostic initially used a mismatched global
browser CLI; subsequent diagnostics use the repository CLI and only owned
sessions were closed. Original logs remain `standalone-browser-1.log`,
`standalone-browser-2.log`, `standalone-browser-history-4.log` and
`standalone-history-browser-5.log`.

## Docker checkpoint

Image `relkit-inspector:stage2-a3` is Linux arm64, non-root `bun`, digest
`sha256:702b0e128c1f9a29d0b40d1eb54c9b9a210cfb669a694d409149028ea1a2c5a0`.
It uses exact candidate archives, Bun/Node/native dependencies and a restricted
context. Builder limits were verified at one CPU / 805306368 bytes; its process
and state volume were removed (`container-build-a3.log`).

Three actual cases pass: Desktop host routing, Linux host-gateway routing in
Desktop's Linux daemon, and foreign-project history denial. Assertions cover
UID, loopback UI publishing, read-only connection directory, writable persistent
history, fixed-port credential rotation, history across recreation, independent
app lifetime, joined shutdown exit zero and unchanged foreign history checksums.
The complete four-case cohort passes, 28 assertions, including private-network
connection with no published app bridge (`standalone-container-a3-4.log`).
A separate bare-metal Linux host is not certified by Desktop daemon evidence.
The current root build-and-container gate also passes seven tests / 48 assertions,
including all four standalone cases, with its exact owned image and cleanup:
`current-root-container-1.log`; see the review checkpoints for its digest.

Initial container failures remain `standalone-container-a2-1.log`: the fixture
changed the port below a fixed target override; clean interruption returned the
runtime's default 130. Fixed-port rotation and container-only clean teardown now
pass, while mixed failures/defects retain failure codes (three focused cases).
A private-network fixture also omitted its Files Layer, then an internal-only
network exposed no host UI mapping. A controlled probe confirms internal
`3210/tcp: []` versus normal bridge loopback publishing/HTTP 200
(`docker-private-port-probe-2.log`). App bridge ports remain unpublished.
All owned runtime/network resources have been removed after completed cohorts.

## Final dependency isolation: 18.1 closed

The final candidate has 92 successful selected cold/warm installation samples:
22 Bun profiles and eight each for isolated Bun, npm and pnpm. No selected
sample has a failure or missing dependency. Seven generic profiles per manager
independently pass installation, module evaluation, declaration and production
artifact checks: 28 profiles / 112 complete observations. The actual policy CLI
passes every profile with `stage: final` and no exceptions
(`final-boundaries-4.log`, `final-policy-4.log`).

The user explicitly authorized proceeding despite RAM/CPU warnings. The existing
`RELKIT_CONSUMER_IGNORE_RESOURCE_LIMITS=1` override admits these serial operations;
actual resource measurements remain logged, worker/deadline limits are unchanged,
and timing is descriptive rather than performance certification. The cancelled
unnecessary duplicate pnpm attempt contributes no accepted sample.

The [final matrix](final-matrix.json) retains exact raw reports and hashes,
46 measured profile budgets, matched Stage 1/baseline comparisons and upstream
version drift. For Bun warm minimal/API development, physical instances fall
from 97 to 72 and logical bytes from 561,618,853 to 128,561,718; native files fall
from five to zero. The new standalone-tool profile separately measures 45
instances and 497,237,345 logical bytes. Shared dependencies are not added across
profiles and no startup/throughput certification is inferred.

The same candidate also passes the complete relocated production command,
including minimal HTTP, selected native worker/Scalar, SQLite/auth migration and
repair, durable job output, bounded shutdown and actual Docker production
(`final-relocated-production-4.log`). Docker uses one CPU, 805,306,368 builder
bytes and 536,870,912 runtime bytes; its auth and durable job probes pass.
Current prepush 12 and the complete uninterrupted full-prepush 9 pass, including
the full command's frozen-install/build/generated-no-diff order.

## Documentation and final acceptance

Source guides, help, canonical skills and all five template skill copies now
describe opt-in bridge/separate tool/history ownership. A read-only skill baseline
recommended obsolete `inspector.port`; the updated reference test gave the
correct config, independent processes, port 3211 and data-preservation guidance.
The template producer passes. Docs generation and freshness checks pass
(`docs-generate-current.log`, `docs-generate-check-current.log`).
Generated references were produced from JSDoc/help, not edited by hand.
React guidance was applied; React Doctor is not installed and was not downloaded.

Current generator, examples and documentation checks pass in Full 5, including
installed creation, generated-reference freshness and 66 documentation cases /
2,224 assertions. Together with the executed separate-tool and production guides,
producer/skill parity and packed flows, these close 17.1–17.2. The current owning
browser/Docker/native R1–R5 scenarios and final relocated production proof close
18.2; their detailed commands remain in the review checkpoints.

The complete Phase 0 guardrail passes 29 cases / 180 assertions. Full 5's
release-staging stall and Full 6's integration timeout
remain failed; fresh actual release readiness and the unchanged integration
cohort subsequently pass. Full 7 completes core verification, native providers,
packed delivery, container/local Docker, deployment and Inspector browser/recovery,
then fails two final Inspector E2E cases at the 30-second whole-test deadline;
the other 50 Inspector and two Commerce cases pass.

An unchanged focused run reproduces both E2E timeouts. Native logs confirm cold
Next development compilation consumes their navigation budget. Per-spec setup
now prepares those routes with a separate 120-second compilation budget and
exact HTTP 200 checks; the original 30-second tests, five-second assertions,
worker count, resets and physical interactions are unchanged. The complete two
owning spec files pass all seven cases (`e2e-compilation-owning-2.log`).
Fresh prepush 12 and full-prepush 9 subsequently pass. The review checkpoints retain every
failed attempt and distinguish fixture preparation from product behavior.

Full 8 remains failed: its final Inspector cohort has 51 passes and one initial
log-loading assertion timeout, while the two corrected compilation flows pass.
Application queries were pending at teardown; neither a product defect nor an
exclusive host cause is established. No further source change is made. The
unchanged owning log files pass 16 cases, and an unchanged complete E2E command
passes 52 Inspector and two Commerce cases with one existing opt-in skip.

The actual complete `bun run prepush:full` then exits zero in
`current-prepush-full-9.log` (SHA-256
`b80092a61a4e71668334128043c4d84af9f1c7a8d31eab79664e6804c6397764`).
It passes all core verification and release checks, native providers, packed
scaffold, seven container cases, local Docker, deployment (14 pass / one existing
cloud skip), actual Inspector browser/recovery and final E2E (52 Inspector /
two Commerce pass / one existing opt-in skip). The three previously failing flows
pass in 7.7, 5.7 and 3.9 seconds. Mutation's semantic gate passes in 11m58s:
501 killed, seven timeouts, 268 survived and 17 uncovered, score 64.06%.
These are recorded outcomes, not complete mutation detection or latency claims.

`final-owned-resources-9.json` records joined teardown, stopped browser PIDs,
no repository Next server or task container, and removal of the owned image.
The unrelated CodeGraph processes and stopped logistics MinIO container are
preserved. HEAD remains `4867ab27d2d66684bebc0673ac4018316adedb1f`; the
Drizzle patch remains
`10ea188b9409dd19aac7bf27f4b12911ae4844c063362b9c2bd11d6a3d936374`.
This closes 18.3–18.4 without replacing failed historical commands with partial
reruns or borrowing new measurements for the retained candidate.

The initial generator gate failed on certified template-source digest drift:
old `c9604a3cc86e4f7cce3b2fcaf23f9fb8d645cf0e1b9932f3ff6fdaa34238aefc`
versus then-current `08268b1d74422aa05a86cfcb03dcf3b11a62874223d6fd45982a76bcb8dc6f4c`.
Its first cohort had 22 passes / one failure; later cohorts did not run
(`generator.log`). Later template edits require real recertification, not a
replacement expected hash. Real certification subsequently passed. Generator
reruns exposed an obsolete config snapshot and a fixture still waiting for a
CLI-owned UI; the snapshot producer and fixture now check omitted-disabled
behavior. Original failures remain `generator-current-2.log`/`generator-current-3.log`.

## Source review and boundaries

Shared decoding is pure Result; public descriptors remain plain TypeScript.
Runtime ownership uses Effect services, explicit Layers, scoped acquisition and
joined native cleanup. Installed Effect/platform 4.0.1 implementation and embedded
examples govern compatibility; the read-only vendor checkout lacks relevant
core/runtime source/tests. Available vendor schema tests were inspected.
The independent review currently accounts for 481 paths: 313 EOF and six
changed-section reviews, 111 individually justified generated/copy exclusions and
51 deletion/coverage reviews, with no authored hash drift. The
[repository ledger](source-reviews.json) is refreshed from the external review
after the frozen verification window. All fifteen findings have owning proof
and complete current full acceptance. The fifteenth covers the confirmed E2E
compilation-preparation gap and retains its seven-case owning proof. The two reviewed
reference images were generated by Playwright; the later Full 7 failures are interaction deadlines, not image
mismatches. Historical failed runs stay failed; source review and runtime
acceptance remain separate.

Existing history, durable/business data, migrations and Drizzle repair are
preserved. The unrelated concurrent root AGENTS addition remains intact.
No commit, push, package/image publication, cloud spend or hosted-CI proof is
included in this local work.
