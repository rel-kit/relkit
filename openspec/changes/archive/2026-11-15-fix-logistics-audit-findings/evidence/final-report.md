# Final report: the same audit on the fixed code

Re-audited 2026-11-15 on packages packed from this change's branch. The baseline is `baseline-report.md` in this folder; finding ids (`RK-nn`, `IN-nn`) are the same. Raw results, logs and screenshots are kept outside the repository; file names below are relative to that evidence folder.

## Verdict

- **Requests:** 1,191 of 1,243 answer as expected under `npm run dev` on Node and under `bun run dev`, with the same 52 rows left in both. None of the 52 is a defect of this change: 40 are by design, 2 are Better Auth's own behaviour, and 10 are contract rows listed below. No row regressed against the baseline, no request answered 5xx, and the two servers give the same answers.
- **RelKit findings:** 43 recorded (35 at the baseline, 8 found while fixing and re-auditing). 34 are fixed, 7 are fixed with a stated remainder, and 2 are answered by design.
- **Inspector findings:** 48 recorded. 46 are fixed, 2 are deferred as new capabilities.
- **Found by the re-audit itself:** 19 Inspector items, and further items from the exploratory run, the command re-run and the review. All are listed below; all are fixed except the ones under "Not fixed".
- **The application's own suites:** 59 integration and 11 unit tests pass in both copies on the final candidates.
- **Not verified on this machine:** Linux screenshot baselines, Windows, one clean full run of the browser suite. Reasons are under "Limits".

## Method

- **Candidates:** the creation closure plus eight `@relkit/*` packages, packed from the branch and served from a local registry, because the candidate version is still 0.9.0 and a cache would serve the published copy. Each install used a fresh cache and was compared with the packed archives file by file: 13,990 files, 0 differ, in both copies.
- **Environments:** two copies of the application on its `audit-fixes` branch, one installed with npm and run on Node 24, one installed and run with Bun 1.3.10, each with its own database.
- **Runs:** five candidate rounds. Each round repeated the request harness in both environments; rounds two and three also repeated the Inspector walk, round three the command surface and an exploratory run outside the harness matrix. Round four repeated the harness and re-checked every fix made after round three on the running application. Round five, packed from the final code commit, repeated the install comparison, the harness and the history comparison.
- **Independent review:** the whole diff was read by a reviewer that did not have the lead's notes.

## Requests: baseline against final

| Run | Requests | As expected | Not as expected | 5xx |
|---|---|---|---|---|
| Baseline, npm install (server on Bun; Node could not start the application) | 1,275 | 1,112 | 163 | 49 |
| Baseline, Bun install | 1,274 | 1,113 | 161 | 50 |
| Final, npm install, server on Node | 1,243 | 1,191 | 52 | 0 |
| Final, Bun install, server on Bun | 1,243 | 1,191 | 52 | 0 |

The final runs have 32 fewer rows. The harness writes a contract row only where the served OpenAPI document disagrees with an observed answer, and 28 such rows no longer arise; 5 rows followed an upload that is now refused or a 500 that no longer happens; 1 new row records that `OPTIONS` is served but not declared. Rows that failed at the baseline and pass now: 81 (npm), 80 (Bun). Rows that passed at the baseline and fail now: 0.

Three rows have a different status in the two final runs and pass in both. Each is the client, not the server: Node's `fetch` sends `Sec-Fetch-Mode`, which makes Better Auth require an `Origin` on sign-in and sign-up, and Bun's `fetch` collapses a leading `//` before sending. With `curl` both servers answer the same.

### The 52 rows that remain, in both environments

| Rows | What the harness expected | What is served | Why it stays |
|---|---|---|---|
| 18 | 400 for malformed JSON | 422 with the issue `malformed-json` | By design (D6), now documented |
| 18 | 415 for a wrong content type | 422 with the issue naming the content type | By design (D6), now documented |
| 3 | 401 or 404 for the graph probe on the application port | 200 with identity fields only | By design (D8): activation needs the hashes; the graph itself is behind the bridge |
| 1 | `health/live` without identity fields | The fields are present in development | By design: removed in production, kept for the development loop |
| 2 | Better Auth keeps the active company after a failed `set-active`; one status has another content type | Better Auth's behaviour | Third party |
| 10 | Contract rows | See next list | Listed remainders |

The 10 contract rows: `HEAD` and `OPTIONS` are served but not in the OpenAPI document (4); 431 is not declared (1); Better Auth's error shape and its operations in the document (2); `x-request-id` is absent on the server-sent event stream of the client contract and on the 431 answer (2); the request id and the trace id are different values, which is documented (1).

## List A: RelKit findings

State applies to both environments unless a runtime is named.

| Id | State | What is true now |
|---|---|---|
| RK-01 | fixed | The cause was the development proxy's hop to the worker, not the runtime: a served application was never affected. An early answer now settles the unread body or closes the connection. 0 bare 400 in every final run |
| RK-02 | fixed | `relkit start` runs in production mode unless `RELKIT_ENV` says otherwise (D9) |
| RK-03 | by design | The application port answers identity only (D8); the Inspector reads the whole graph through the bridge with its session token (see RK-43) |
| RK-04 | fixed | A 500 body is generic in every mode; the cause is in the error log and on the request's span, redacted (D10). 0 responses with SQL text in the final runs |
| RK-05 | fixed | `relkit add database` renders `openPostgresDatabase` / `openMysqlDatabase` from `@relkit/drizzle`, which run on Node and Bun |
| RK-06 | fixed | One-shot commands read the environment files on Node; a failing Drizzle configuration shows its own reason, with credentials masked |
| RK-07 | fixed | The development worker listens on loopback |
| RK-08 | fixed, with a remainder | A rule with roles or permissions is decided before input. A rule that only allows is still decided after validation, by design |
| RK-09 | fixed | The body limit applies to every route, mounted handlers included, declared or streamed |
| RK-10 | fixed | Query-string coercion no longer applies to JSON bodies |
| RK-11 | fixed | A body that is `null`, an array or a string is refused |
| RK-12 | fixed | `createWriteUrl(key, { contentType, contentLength })` signs both; the store refuses another type or size. Without a declared type the URL is signed as before, which is documented |
| RK-13 | fixed | 409, as declared |
| RK-14 | fixed | `RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED` at the import, naming the module |
| RK-15 | fixed | One error; the type check is skipped after a failed evaluation; `relkit graph` names the first error of the last check |
| RK-16 | fixed | `RELKIT_START_BUILD_MISSING`, naming `relkit build` |
| RK-17 | fixed | `relkit doctor` reports Bun-only imports on Node, environment files, the package manager, and prints the package manager's reason when the lockfile check fails |
| RK-18 | fixed | A syntax error is reported in about 2 s on Node and 0.4 s on Bun at its own line; the fix reloads in 4.8 s and 0.6 s |
| RK-19 | fixed | The cause was a garbage-collected link between abort signals in Node's `fetch`; the client now ends the iteration itself |
| RK-20 | fixed | `npm audit` on the application installed from the candidates: 0 advisories (baseline 14, one critical). `@hono/node-server` 2.1.6, Better Auth 1.7.7 |
| RK-21 | fixed | 413 for an oversize body, declared or streamed, in development and production |
| RK-22 | fixed, with a remainder | `HEAD` on a route has `GET`'s `Content-Length`. On Bun, `HEAD` on an unknown path or a control-plane document still says 0 |
| RK-23 | fixed | An `OPTIONS` that is not a preflight answers 204 with `Allow` |
| RK-24 | fixed, with a remainder | `x-request-id` is on control-plane answers, and a control-plane 404 names the same id in its body. Absent on two answers (see the contract rows) |
| RK-25 | fixed, with a remainder | Framework answers are Problem Details. Better Auth keeps its own shape |
| RK-26 | fixed, with a remainder | Application operations declare 401, 403, 413, 422, 429 and 500 where they apply. See the contract rows |
| RK-27 | fixed | `nosniff` and `no-store` on per-user JSON and on every Problem, early answers included |
| RK-28 | by design in development | See the 52 rows |
| RK-29 | fixed, with a remainder | 404, 405 and 422 are logged at INFO on one line. 401 is still WARN with its request and trace lines |
| RK-30 | fixed | One closing line; exit status 130, 143 or 129 |
| RK-31 | fixed | "Database is up to date: no migrations were pending." |
| RK-32 | fixed | Points at the binding and says what to write |
| RK-33 | fixed | `RELKIT_UNKNOWN_COMMAND`, the list of commands, exit status 2 (D14) |
| RK-34 | fixed, with a remainder | Help has real examples and defaults; `check --json` is 2.9 KB (D13). `relkit graph` still prints one long line |
| RK-35 | fixed | An npm project gets `allowScripts`; `relkit doctor` says that npm ignores `patchedDependencies` and that this is safe |
| RK-36 | fixed | The in-process test client evaluates access rules like the served application |
| RK-37 | fixed | `relkit add` installs without a frozen lockfile after it changed the manifest |
| RK-38 | fixed | Messages name the project's package manager |
| RK-39 | fixed | A same-origin `POST` under `relkit dev` on Node is served |
| RK-40 | fixed | A same-origin WebSocket under `relkit dev` on Node is accepted |
| RK-41 | fixed | A request without a declared body reaches the handler without one, on Node as on Bun |
| RK-42 | fixed | An oversize body answers 413 through the proxy on Node; a request on a connection that is closing answers 503 unhandled |
| RK-43 | fixed | The Inspector reads the whole graph through the bridge: 92 nodes and 118 edges on the audited application in both environments. A test now goes through a real generated server |

## List B: Inspector findings

| State | Count | Ids |
|---|---|---|
| fixed | 46 | every id except IN-30 and IN-44 |
| deferred as a new capability | 2 | IN-30 (the caller on each request), IN-44 (control-plane requests are not recorded, by design) |

Fixed within a stated limit:

- **IN-02, IN-08, IN-26:** invoke, channel connect and "send request" run without a user session (D11). Each now says so and shows the application's real answer. A public function or channel works; one that needs a signed-in user is refused, and the page says why. Choosing a user is a follow-up.
- **IN-04:** the request detail shows the function's input and result, as the application's capture setting allows. HTTP headers and raw bodies are a follow-up (D12).
- **IN-13:** replay works. Retry and cancel were not exercised on the application, because it produced no dead letter; they are covered by tests of the local provider.

Checked against ground truth in the last round, both environments: every harness request that reached the application is in history with the same method, path and status (0 mismatches); the rows not in history are the 81 control-plane requests and, on Node, one request the development front answered itself; records lost 0.

## Found by the re-audit

### Inspector (second and third walk)

| Id | What was wrong | State |
|---|---|---|
| NF-1 | Every page failed to load on a real application (the graph probe change, RK-43) | fixed |
| NF-2 | About 1 request in 4 to 8 lost its record or its end under load | fixed: one span revision per finished span; framework success logs stay out of the inspection stream (D15). 0 lost in the last two rounds |
| NF-3 | On Node every state-changing Inspector action answered 403 | fixed (same cause as RK-39, in the bridge) |
| NF-4 to NF-7, NF-9, NF-11 | Oldest-first lists, a wrong session start, replay wording, a false "missed updates" note, "incomplete" with nothing lost, "0 records" worded as a failure | fixed |
| NF-8 | Framework refusals labelled as declared errors | fixed: outcome `refused`, selectable in the filter; includes an unknown RPC procedure |
| NF-10 | An application outage shown as degraded history | fixed |
| NF-12 | Channel connect answered an identity conflict after the browser's cookies stopped being forwarded | fixed: the Inspector keeps one anonymous identity of its own |
| NF-13 | History stopped for the rest of a session, and the status said nothing was lost | fixed. The cause was one record whose text held an unpaired surrogate, which the history database refused together with its batch. Such text is stored; a refused record no longer blocks its batch; a stopped worker is reported within a second and replaced; records history could not store are counted and named |
| NF-14 | Event deliveries listed oldest first | fixed |
| NF-15 | Route cards said "all public" for routes with an access rule | fixed |
| NF-16 | A call made after a reload failed without saying why | fixed: retried once, then explained |
| NF-17 | A client that left a realtime call logged an error | fixed |
| NF-18 | One page read the graph 27 times | fixed: once per generation |
| NF-19 | 5 px of horizontal overflow at 900 px on one page | not located; open, low |

Also fixed: a second Inspector on the same project printed error blocks every 1.5 s. It now says once which Inspector holds the history and where it listens, serves without history, and the first is not disturbed.

### Exploratory requests

| What was found | State |
|---|---|
| Bun: a malformed or missing `Host` answered Bun's error page with source paths | fixed: 400 as on Node; no framework listener can serve that page in any mode |
| Bun: a `GET`, `HEAD` or `OPTIONS` with a body broke the next client's request | fixed |
| Bun: a path starting with `//` passed the block on inspection paths; `Host` could change the route | fixed: 404 and 400 on both runtimes |
| A guarded channel answered "not found" over WebSocket and worked over HTTP | fixed: socket messages run in the upgrade request's context |
| A refused WebSocket upgrade answered 502 or 500 | fixed: 403 `origin-denied` |
| An unknown control-plane path named two request ids | fixed |
| Early answers lacked `nosniff` and `no-store` | fixed |
| A state-changing request without `Origin` but with a foreign `Referer` or a cross-site `Sec-Fetch-Site` was treated as a trusted service call in development | fixed |
| Invalid UTF-8 in a JSON body was stored with replacement characters | fixed: 422 |

Two findings were the application's and are fixed on its branch: a uniqueness violation raced into a 500 on Bun (the driver reports the code in another field), and a status change could undo a retirement made at the same time.

### Command surface

Every baseline command defect is fixed or by design. The re-run added: the lockfile check of `relkit doctor` gave no reason (fixed); a client that disconnects early printed `Error: aborted` (fixed); `relkit dev` with a coded startup failure ended with "internal error, report a bug" (fixed: it ends with the code, its message and next step, and exit status 1); a lone `SIGTERM` could leave `relkit dev` alive under a native TypeScript launcher (fixed); copying the project folder triggered a rebuild per file (fixed: the watcher compares content; 0 rebuilds for a full copy, was 58 to 100).

### Round four and the repository verification

Found while re-checking the last fixes on the application and while running the repository's own suites on the merged branch; each is fixed with a test that fails without the fix.

| What was found | State |
|---|---|
| `relkit dev` printed a coded startup failure and exited with status 0: the failure carried the new version's own exit code, and the command line read it as its own | fixed: exit status 1 |
| The notice of a second Inspector named the first one's history worker, not the Inspector a developer can stop | fixed |
| The watcher read and hashed every watched file at start without a bound; a project root without `src` that holds much more than source started slowly (40 s on this repository with its worktrees) | fixed: at most 20,000 entries and 256 MiB per watched directory |
| A file first seen after the start was never recorded, so every later event for it counted as a change | fixed |
| A type error saved while the type checker was on its first pass was never reported; the terminal kept saying "No type errors" (12 of 12 under load) | fixed: that pass is discarded and the checker started again, at most twice. 12 of 12 report now |
| Five page unit tests failed after two page merges that had not been run together | fixed |
| `@relkit/client`: a read that rejected after its caller aborted left an unhandled rejection, which can end a Node process. It came from this change's own fix for RK-19 | fixed |
| The "application is not connected" banner could appear up to ten seconds late: since the pages share one request client, the status read behind it was answered from a two-second cache. It came from this change's own fix for NF-18 | fixed: that read bypasses the cache |

Two tests were passing for the wrong reason and are corrected: the watcher test wrote `.env.local`, which is not an input in test mode, and passed only because one save used to cause two rebuilds; the type-check test polled for an event name the terminal never prints and so always waited four minutes.

Two tests were stale and are corrected: the Inspector's generated-application test read `server/index.js`, which development has not produced since it began running `server/index.ts` directly (it failed on `main` too), and expected a 404 request line at WARN, which this change logs at INFO; the Better Auth deprecation test depended on no earlier test in the same process having used the deprecated form.

One failure was this checkout, not the code: template folders held ignored `.relkit` output from earlier local runs, which creation copied into the new project. They are removed here. The build also copies such output into the packed `create-relkit` archive (one stale `diagnostics.json` was in the fourth candidates), so a release must be packed from a clean checkout, as CI does; skipping `.relkit` in that copy is recorded as a follow-up.

### Review

No high finding. Fixed: an early answer waited for the whole unread body without a time limit (now 500 ms); a development error logged after its request completed stayed held; credential masking stopped at the first `@`.

## Not fixed

| Item | Why |
|---|---|
| Bun: two requests written in one TCP write (pipelining) close the connection without an answer | Reproduced on a bare `Bun.serve` of Bun 1.3.10 with an asynchronous answer. The development front must await the worker, so it cannot avoid it. Clients that wait for each answer are not affected |
| Node: a refused WebSocket upgrade has its status and headers but no body | The Node server library writes a zero-length answer for a refused upgrade. A browser cannot read that body in any case |
| Bun accepts conflicting `Content-Length` values and refuses chunked trailers; both runtimes accept `Transfer-Encoding: gzip, chunked` | Runtime behaviour, not changed |
| A signed upload URL stays valid until it expires, also after confirm or delete | How presigned URLs work; an application can shorten the expiry |
| Query strings and path parameters decode leniently (`%FF` becomes U+FFFD, `0x10` is 16) | Left as it is; only JSON bodies are strict |
| A lone `SIGTERM` during `relkit check` may leave the native compiler running | Seen once, not reproduced |
| The count of records lost when a session ends while history is down is a lower bound | Records produced after the last pull were never seen by the Inspector |
| `runtime/events` has no descending order in the API; the page sorts what it loads | Low |
| NF-19 | Not located |

Accepted from the review: a body without `Content-Length` is buffered outside `timeoutMs` (bounded by the listener's timeouts and the body limit); a JSON route response is buffered once to set its length.

## Deferred, with reasons

- **D11:** acting as a user from the Inspector.
- **D12:** HTTP headers and raw bodies on a request record; the caller on each request record.
- **D15:** framework success logs in the Inspector are off by default; `remote.frameworkSuccessLogs: true` sends them again.

## Changes that a project will notice

- `relkit start` is production unless `RELKIT_ENV` is set.
- Better Auth 1.7.7 removes `account.issuer`; `relkit migrate` has a rule for it and the migration guide has the steps.
- `relkit check --json` lists generated files without their text; `--include-outputs` adds it.
- An unknown command exits with status 2.
- A signed upload must send the content type and length it was signed for, when they were declared.
- In development, a request without `Origin` that carries a foreign `Referer` or a cross-site `Sec-Fetch-Site` is no longer a trusted service call.
- A JSON body that is not valid UTF-8 answers 422.

## The audited application

Its `audit-fixes` branch: the database service uses `@relkit/drizzle/pg` and runs on Node; Better Auth 1.7.7 with the `account.issuer` migration; signed uploads declare type and length; text inputs refuse a NUL character; the constraint mapping reads the code Bun's driver reports; a status change is conditional on the status it read; `@relkit/client` is declared; the README is npm first; the upload size test follows the signed-upload behaviour. Its lockfile is not regenerated, because the candidate packages are not public: it must be regenerated after the release.

## Repository verification

Run on the merged branch with no fix session working. The code commit verified is the one the last candidates were packed from; the only later commit adds this report and the checklist.

| Check | Result |
|---|---|
| `bun run prepush` (install, formatting, lint, build, repository checks, konsistent, typecheck, unit, graph, contract, security and documentation tests, documentation build) | passes |
| `bun run test:packages` (every package's suite) | passes: 3,385 Vitest tests and the Bun cohorts (522 and 416 tests among them) |
| `bun run test:inspector` (Inspector API and page unit tests) | 501 of 501 |
| Inspector browser suite (105 tests, Playwright, macOS) | Every test passes, but no single run was clean: three full runs passed 98, 104 and 100 of 105 with a different set failing each time. The first run's seven included one real defect (the banner, above) and three stale expectations, all corrected; every other failure was a timeout while the machine was loaded by other work, and the six spec files that had any failure pass 50 of 50 when run on their own |
| Inspector acceptance script (a real browser driven through every action) | passes |
| Reload recovery probe (a rejected reload and its repair under traffic) | passes: 205 requests, no outage or rollback |
| The application's own suites, both copies, final candidates | 59 of 59 integration, 11 of 11 unit |
| `openspec validate fix-logistics-audit-findings --strict` | valid |
| Generated documentation | current |

The suites were run more than once, because they found defects of their own: each row above is the last run, and the section "Round four and the repository verification" lists what the earlier runs found.

The candidates were packed five times. The last round repeated the install comparison (13,993 files, 0 differ, both copies) and the harness (the same 1,191 of 1,243 in both environments, no status changed against round four), compared history again (0 mismatches, 0 records lost), and timed the banner on the running application: it appeared 0.7 s after the Bun server stopped.

## Limits

- **Application integration suite (59 tests):** run last, after the audit machine's PostgreSQL server was repaired (its data folder had lost twelve empty directories, which made `CREATE DATABASE` fail; unrelated to RelKit). 59 of 59 pass in the npm copy and in the Bun copy on the final candidates. One test was corrected first: it expected a file larger than declared to be stored and then discarded at confirm (422), and with signed uploads the store refuses that file, so confirm answers 409 `documents.upload-missing`.
- **Linux:** the Inspector's screenshot baselines for Linux must be regenerated in CI; only the macOS ones were regenerated and viewed. Every suite above ran on macOS only.
- **Browser suite:** not one clean full run on the audit machine (see the table); a quiet machine or CI should show one.
- **Windows:** not tested.
- **Production mode on a real host:** the exploratory run covered `relkit dev`; `relkit start` was covered by the Node acceptance run and by tests, not by the exploratory matrix.

## Evidence index

`final/npm/`, `final/bun/` (round five: `results.jsonl`, `summary.json`, `server.log`), `final/*-run1` to `-run4` (earlier rounds), `final/candidates/COMMIT`, `final/*-candidate-identity.txt`, `final/inspector/findings-final.md` and `final/inspector2/findings-final2.md` (walks), `final/inspector3/` (round four: history comparison and re-check logs), `final/inspector4/` (round five: history comparison, banner timing), `final/commands/report.md`, `final/exploratory-findings.md`, `final/verify/` (repository verification logs, `npm-audit.json`), `screens/final/`, `screens/final2/`, `screens/final3/`, `screens/final4/`.
