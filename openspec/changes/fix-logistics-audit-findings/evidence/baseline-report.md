# Baseline report: RelKit 0.9.0 through a real application

Audited 2026-11-14 on the published 0.9.0 packages (`main` differs only by three release-tooling commits). Raw results, logs and screenshots are kept outside the repository; file names below are relative to that evidence folder.

## Method

- **Application:** a logistics backend: 25 routes, Better Auth with companies and five roles, one event with a durable reaction, one realtime channel, one private S3 bucket with signed URLs.
- **Environments:** two clean checkouts, one installed with `npm ci`, one with `bun install`, each with its own database.
- **Requests:** a plain-`fetch` harness, about 1,275 requests per run: authentication, every route for eight kinds of caller, every declared error, validation edges, full create/read/update/delete lifecycles, the event reaction, realtime, signed uploads, system routes, and a comparison of observed behaviour with the served OpenAPI document.
- **Commands:** every package script under `npm run` (Node 24), `bun run` and `bun --bun run`.
- **Inspector:** every page walked against a run whose ground truth is known, plus a scripted capture of 43 pages (text, screenshot, console and network errors) to repeat after the fixes.
- **Causes:** each failure traced to source; file and line are in the tasks.

## Totals

| Run | Requests | As expected | Not as expected |
|---|---|---|---|
| Bun install, harness on Node | 1,274 | 1,113 | 161 |
| Bun install, harness on Bun | 1,274 | 1,114 | 160 |
| npm install (server on Bun; Node cannot start this app) | 1,275 | 1,112 | 163 |

The npm and Bun installs fail in the same places. Differences between runs are one flaky realtime row (RK-19) and the cascade from RK-01.

Clean: the access matrix (200 of 200 route × caller cells), isolation between companies, the event reaction (66–194 ms), realtime delivery, denial and replay, the application's own suites (59 integration, 11 unit), normal reload (about 1 s), clean stop with no orphan process or container.

## List A: what RelKit failed to serve

Severity: **high** = unsafe, data exposed, valid work fails, or a documented path is dead; **medium** = wrong behaviour with a workaround; **low** = unclear or inconsistent.

| Id | Sev | Where | Expected | Actual |
|---|---|---|---|---|
| RK-01 | high | HTTP runtime, keep-alive | A request is not affected by the one before it on the same connection | After a cross-origin `POST` with a body is rejected early (403 `origin-denied`), the next valid request on that connection gets a bare `400`, `connection: close`, no body, no request id, no log line. Reproduced: 22 of 300; control 0 of 300. No layer drains the unread body or closes the connection; the same early answer exists for 413, 404, 405, route-level 401 and 503 |
| RK-02 | high | `relkit start` | A built server runs in production mode | `start` passes neither `RELKIT_ENV` nor `NODE_ENV`; the server treats anything but `NODE_ENV=production` as development, so RK-03, RK-04 and open API docs apply to a production build. Read from code, not yet run |
| RK-03 | high | `GET /_relkit/v1/graph` on the application port | Inspection data needs the development bridge | 200 without a session: the full graph (148 KB), 76 source paths, permission names, environment variable names. Values, source text and the other inspection routes are not exposed |
| RK-04 | high | 500 responses | No internal detail in the body; the cause in the log | `detail` carries the failed SQL text and bound parameters; the server log has only `→ 500`. Triggered by a NUL byte in a path id or string field (29 rows) |
| RK-05 | high | `relkit add database` | A project created with npm runs on Node | The rendered service always imports `drizzle-orm/bun-sql` (or `bun-sqlite`) and adds a `bun --bun drizzle-kit generate` script; `check`, `dev` and `build` then fail on Node with `Cannot find package 'bun'` |
| RK-06 | high | `db migrate`, `env check`, `env list` on Node | `.env` is read as under Bun; a failing config shows its reason | Node loads no `.env`; `db migrate` answers `RELKIT_DB_CONFIG: Could not load Drizzle configuration` and discards the real message (`Set DATABASE_URL…`); `env check` reports set variables as missing |
| RK-07 | medium | Generated server bind address | The development worker listens on loopback | It binds `0.0.0.0`; the application and `/_relkit/v1/graph` answer on the LAN address while the configured port is on 127.0.0.1 |
| RK-08 | medium | Order of checks | An anonymous or unauthorized caller gets 401 or 403 | Input validation runs first: 422 with the field names (6 rows) |
| RK-09 | medium | `server.maxBodyBytes` | Applies to every route | Only the `Content-Length` header is checked; the Better Auth mount reads the raw request, and the development proxy strips the header: a 5 MiB sign-up succeeded |
| RK-10 | medium | JSON body decoding | `"3500"` is rejected for an integer field, as the contract says | Query-string coercion is applied to JSON bodies: accepted with 201 (3 rows) |
| RK-11 | medium | JSON body shape | `null`, an array or a string is rejected | Treated as "no fields": a `PATCH` answers 200 as an empty change (9 rows); `POST` reports each field missing |
| RK-12 | medium | Signed upload URL (`@relkit/s3`) | The bucket's allowed content types and size limit hold | The URL signs `host` only: a wrong content type and a 5,000,001-byte object were stored and served back (4 rows) |
| RK-13 | medium | Realtime identity precondition | 409, as declared | 500 `IDENTITY_PRECONDITION_FAILED`: the check runs inside the lazy stream, after the status mapping |
| RK-14 | medium | Bun-only import evaluated on Node | A coded diagnostic at the import, saying the module needs Bun | `RELKIT_EVALUATOR_IMPORT_FAILED` at line 1, column 1 with a generic hint; `build` shows it instead of its own diagnostic |
| RK-15 | medium | `relkit check` after a failed evaluation | One error | The real error followed by 86 type errors from stub registries; `graph` then says "Run relkit check", which cannot succeed |
| RK-16 | medium | `relkit start` without a build | A coded message naming `relkit build` | `ENOENT: ENOENT: no such file or directory … application.graph.json` |
| RK-17 | medium | `relkit doctor` | Reports what stops the project from running | Passes everything on a Node setup that cannot run `check`, `dev`, `db migrate` or the Inspector |
| RK-18 | medium | Reload after a syntax error | The error is reported at once; the next save reloads at once | Reported 10 s later as `RELKIT_CANDIDATE_HEALTH_TIMEOUT`; a fix saved inside that window loads after about 26 s |
| RK-19 | medium | `@relkit/client` subscription on Node | Iteration ends when the caller aborts | Does not end within 3 s after a replay plus a live event (intermittent, Node only) |
| RK-20 | medium | Dependency pins | No known advisory in a fresh install | `npm audit`: 12 moderate from `@hono/node-server` 2.1.5 (pinned by `relkit`), 1 critical and 1 low from `better-auth` 1.7.1 |
| RK-21 | low | Oversize body status | One status | 413 when `Content-Length` is declared, 422 otherwise; always 422 in development. Malformed JSON and wrong content type are 422 by design but undocumented |
| RK-22 | low | `HEAD` | Same `Content-Length` as `GET` | 0 |
| RK-23 | low | `OPTIONS` that is not a preflight | 204 with `Allow` | 403 `origin-denied` with a same-origin `Origin`; 405 without one |
| RK-24 | low | `x-request-id` | On every response; findable from an error body | Missing on 83 of 1,200 (all `/_relkit/v1/*`); the header id and the body `traceId` are different values with nothing joining them |
| RK-25 | low | Error shape | Problem Details everywhere | 11 shapes: text `Not found` from the development proxy, `{error}` from internal endpoints, Better Auth's own |
| RK-26 | low | OpenAPI | Describes what is served | No 400/401/413/500 for application routes; Better Auth operations with wrong schemas; the generated file (25 operations) differs from the served one (79) without saying so |
| RK-27 | low | Response headers | `nosniff`, no caching of per-user JSON | Neither is set |
| RK-28 | low | `health/live` | Status | Also graph, manifest and plan hashes, in every mode |
| RK-29 | low | Development log | Readable | Every 4xx at WARN (680 lines); long paths wrap the status onto a second line; names cut in the middle |
| RK-30 | low | Ctrl+C | A quiet stop | An error block: `RELKIT_INTERRUPTED … next: Run the command again` |
| RK-31 | low | `db migrate` with nothing pending | Says so | `Database migrations applied.` |
| RK-32 | low | `RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED` | Points at the binding and says what to write | Points at the `defineApp(` call; generic hint |
| RK-33 | low | Unknown command | "Unknown command", the list | `Command is not implemented … check that @relkit/cli is up to date`, exit 1 |
| RK-34 | low | Help | Real examples, defaults, prerequisites | Examples repeat the bare command; `check --json` is one 420 KB line with generated files embedded |
| RK-35 | low | Project created for npm | Only fields npm uses | `patchedDependencies` is written and silently ignored; nothing for npm's install-script approval |
| RK-36 | medium | `@relkit/testing` in-process HTTP client | Evaluates function access rules like the served application | Every call to a route with a permission rule answered 500 in process (anonymous, unpermitted and permitted alike): the harness built its auth runtime without the access resolver and mapped access failures to an internal error. The application's tests start a real server for every file to avoid it. Confirmed on 0.9.0 by the fix task's first test |
| RK-37 | medium | `relkit add` in a pnpm project under CI | The install after `add` succeeds | `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: `add` has just changed the manifest and the workspace file, and runs a plain `pnpm install`, which is frozen when `CI` is set. Found by the extended Node acceptance run during the fix phase |
| RK-38 | low | Messages after `relkit add` in npm and pnpm projects | Name the project's package manager | The failure text says "Run `bun install`" and the next steps say "bun install / bun run check". Found by the same run |
| RK-39 | high | `relkit dev` on Node, state-changing requests | A same-origin `POST` is served | Reported during the fix phase and confirmed by the fix task's first test: behind the Node development proxy a `POST` whose `Origin` is the server's own public origin answers 403 `origin-denied`; Bun `dev` and Node `start` are fine. Cause: the proxy sets `Host` to the public authority, but Node's `fetch` replaces it with the worker's private address, and the worker derives its request URL from `Host` |
| RK-40 | high | `relkit dev` on Node, WebSocket connections from a browser | A same-origin WebSocket is accepted | Found while fixing RK-39: the proxy opens its upstream socket with Node's `WebSocket` client, which also replaces `Host`, so the worker would judge the browser's `Origin` against its private address and refuse the realtime and RPC sockets. Confirmed by the fix task's first test: on Node a same-origin handshake to `/_relkit/v1/rpc` answers 502 (the worker refuses the upstream socket and the proxy reports it), and a `@relkit/client` subscription fails with "RelKit WebSocket connection failed."; Bun answers 101. Node's `WebSocket` sends the forwarded `Origin` and cookies but replaces `Host`; Bun's keeps it |

## List B: what the Inspector failed to deliver

Kinds: **wrong** (untrue), **missing** (promised or needed, absent), **ambiguous** (a reader would be unsure or conclude the wrong thing), **action** (a control that does not do what it says), **health**.

### Starting it

| Id | Sev | Kind | What happens | What is true |
|---|---|---|---|---|
| IN-46 | high | action | `npm run inspector` exits: `InspectionConnectionError … verify launch options, private connection directory` | The launcher calls `Bun.spawn` while running on Node; the package declares Node support. The portability check has this file on its allow-list |
| IN-47 | high | action | `bun --bun run inspector` prints "Ready" and every page answers HTTP 500 | The UI child is started as `node`, which under `--bun` is Bun; the UI cannot run on Bun |
| IN-48 | medium | ambiguous | With no development server running: "Connecting", "Awaiting active generation", nothing in the terminal | No session was found; it never says so or what it waits for |

### Pages

| Id | Sev | Page | Kind | Shown | True |
|---|---|---|---|---|---|
| IN-01 | high | Requests | wrong | "Newest first · page 1" | Page 1 is the oldest; the newest are on page 23 |
| IN-02 | high | Function detail, Invoke | action | `RELKIT_INSPECTOR_ACTION_FAILED / Function invocation failed.` | The application answered 401: the invoke has no session and no way to choose one, so 24 of 25 functions can never be invoked |
| IN-03 | high | Request detail (500) | missing | "defect", `RELKIT_UNEXPECTED_DEFECT` | The cause is nowhere: not in spans, logs, attributes or the Errors page |
| IN-04 | high | Request detail | missing | Headers and bodies: "Not retained by the active backend" | The application config enables bounded redacted capture; no body is ever shown |
| IN-05 | high | Request detail (409) | missing | "declared-error", "ApplicationFailure" | The error code the client received (for example `fleet.plate-taken`) is not shown |
| IN-06 | high | Request detail (422) | missing | The step `http.validation.failed` | Which field failed and why is not shown, for any of 347 responses |
| IN-07 | high | Channel detail | wrong | "Partition params: Not declared", "Replay: live only" | The channel declares `companyId` and a replay window of 300 s / 500 events |
| IN-08 | high | Channel detail, Connect | action | "Channel resource was not found." | The channel exists; the application denied a connection without a session. The params box starts as `{}` although a parameter is required |
| IN-09 | high | Overview during an outage | wrong | "Connected", "BACKEND connected" for about 20 s, beside "HISTORY disconnected" | The development server was down |
| IN-10 | high | Requests, Functions, details, Env during an outage | missing | "Live: connected", blank or stale content | No error state on any page; the 503s only reach the console |
| IN-11 | medium | Request detail (status change) | missing | "Continuations: 0" | The event reaction ran as its own trace and is not linked to the request in either direction |
| IN-12 | medium | Event detail, Publish | action | One click sends `{}`; a bare `RELKIT_INSPECTOR_ACTIONS_UNAVAILABLE` appears below 25 rows, out of view | Actions are not available in the generated development server; no plain reason, no schema check, no confirmation |
| IN-13 | medium | Event detail, Replay | action | Fires at once; same bare code far from the button | Same; retry and cancel never appear and could not be checked |
| IN-14 | medium | Event detail | wrong | "Completed 100", "100 deliveries" beside "25 publications" | 100 is the page limit shown as a count |
| IN-15 | medium | Event detail rows | ambiguous | Ids only | No time, payload or link, so a reader cannot choose which event to replay |
| IN-16 | medium | Overview | wrong | "Requests 100+", "Error rate 5.0% (5 of 100)" | 1,144 retained, 29 of them 500 (2.5%); the rate is over the last 100 only |
| IN-17 | medium | Overview, Traces, Requests | wrong | "2,229 dropped events", "42 producer drops", storage "0 drops" | Three numbers for drops that disagree; none says what was lost |
| IN-18 | medium | Overview | wrong | "Export failures 1,823" beside "No external exporter configured" | There is no exporter that could fail |
| IN-19 | medium | Logs | ambiguous | 50 lines of `Execution operation completed … JobQueue.get` labelled "http" | Internal polling of the local event provider at 75–150 records/s when idle; application logs are found only by search; this noise is what drives the drop counters |
| IN-20 | medium | Routes, Domains, Graph | missing | 25 routes; domain "auth" is "empty … used by none" | 160 retained requests (Better Auth, health, RPC) have route "unknown"; three services use auth |
| IN-21 | medium | Requests filters | missing | Route id, function id, ids, "outcome" text, time | No status, method or path filter, no search; filters are not in the URL |
| IN-22 | medium | Errors | missing | 23 declared errors | No occurrences: none of the 29 500s or 29 409s, no count per code |
| IN-23 | medium | Request detail | wrong | "Spans 21" and "1 span" for the same request | Two numbers for one quantity |
| IN-24 | medium | Requests | ambiguous | 16 rows "499 cancelled" | The client received 200 and a stream; 499 never went on the wire |
| IN-25 | medium | Bucket detail | missing | Key, size, Preview | No content type or modified time; a PNG stored as `application/x-msdownload` previews as "metadata-only" with the mismatch hidden |
| IN-26 | medium | Route detail, Send request | action | "Request completed." with a 401 body | No way to send as a user, so 24 of 25 routes can only answer 401 |
| IN-27 | medium | Jobs (4 pages) | wrong | "The jobs API is unavailable… keeps retrying" | The application has no jobs; this reads as a broken backend |
| IN-28 | medium | Overview, generation history | ambiguous | Three "Generation activated · initial build", two named `generation-1`, one unnamed | Three restarts with one graph; restarts and reloads cannot be told apart |
| IN-29 | medium | Function detail | wrong | "Recent logs 0", "Observed edges 0" | Request details for the same function show 11–17 correlated logs; bucket and event use never appear as edges |
| IN-30 | medium | Request detail | missing | No caller | No user, role or company on any request in a multi-tenant application (87 × 403, 32 × 401) |
| IN-31 | low | Bucket preview (PDF) | ambiguous | An empty frame | No error and no metadata (the test file is not a valid PDF) |
| IN-32 | low | Buckets, Providers | ambiguous | Runtime "not reported"; "2/3 connected" | The overview says the same bucket provider is healthy |
| IN-33 | low | Env, Provider detail | wrong | Every variable and the bucket point at the `defineApp(` line; package "Unavailable" | Variables are declared in the env module; the binding is nine lines lower; no set/missing indicator |
| IN-34 | low | Errors, Routes, Functions | ambiguous | "20 shown" | 23 errors and 26 functions exist; no total |
| IN-35 | low | Times | ambiguous | Local time, UTC and ISO on one page, no zone label | — |
| IN-36 | low | Overview, recent requests | ambiguous | Route id on live rows, path on loaded rows | — |
| IN-37 | low | Command palette | action | Opens without focus; finds no request or trace id | — |
| IN-38 | low | Middlewares, Agents, Tools | wrong | "No … match the active filters." | No filter is active; the application declares none |
| IN-39 | low | Function invoke form | ambiguous | Fields with defaults labelled "required" | The route form calls the same fields optional |
| IN-40 | low | Env at 900 px | health | Horizontal overflow | — |
| IN-41 | low | Theme | health | Dark although the system preference is light | The toggle works |
| IN-42 | low | Unknown URL | health | React hydration error on the 404 page | — |
| IN-43 | low | Several tabs | health | The third tab stays "connecting" | Each page opens 2–3 event streams and hits the browser's per-origin limit |
| IN-44 | low | Requests | missing | — | 9 requests to unknown `/_relkit/v1/*` paths are not recorded |
| IN-45 | low | Graph | ambiguous | Text about 5 px at default fit; white zoom control in dark theme | The bucket has no node although a service uses it |

Correct as they are: Traces, Diagnostics, API reference and Scalar, Cache, MCP, agent graphs.

Worth keeping: 99.2% of requests captured with exact method, path, status and request id; no secret shown anywhere; request ↔ trace ↔ log links; paging to the oldest record; history survives a restart; the bucket explorer matches the database; contracts and source links on function, event and channel pages; every page renders in about 0.3 s.

## Kept apart

- **Application:** `@relkit/client` is used by its tests but not declared; its README recommends `bun --bun run` for every script (breaks the Inspector, IN-47), says nothing about npm, and two sentences are inexact (active company after accepting an invitation; error shape of Better Auth routes).
- **Better Auth:** a failed `set-active` with an unknown company clears the active company; several of its OpenAPI schemas do not match its responses.
- **By design, to document:** malformed JSON and wrong content type answer 422; the request id and the trace id are different values; values in `.env` override exported shell variables under `relkit dev`; `relkit build` refuses local-only provider bindings.

## Evidence index

`baseline/<env>/results.jsonl`, `summary.json`, `server.log`; `baseline/npm/commands/*.log` and `commands.json`; `baseline/npm/commands/bare-400-repro.log` (RK-01); `baseline/bun/commands/worker-port-exposure.log` (RK-07); `baseline/npm/commands/dev-reload2.server.log` (RK-18); `baseline/npm/commands/npm-audit.json` (RK-20); `screens/baseline/walk-dark/` (43 pages), `walk-900-light/`, `walk-npm/`; `harness/run.mjs`, `compare.mjs`, `inspector-walk.mjs`.
