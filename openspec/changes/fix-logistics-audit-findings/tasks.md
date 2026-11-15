# Tasks

> Finding ids (`RK-nn`, `IN-nn`) refer to `evidence/baseline-report.md`. A box is checked only after the verification named in its task has run.
>
> Rules for every fix task: write the regression test first and see it fail; fix; run the named suite; keep files at or under 250 lines; keep `Bun.*`, `bun:` and `node:` calls inside runtime adapters; add one changeset per package whose behaviour changes; no breaking change to public API. A group edits only the files it owns; anything else goes back to the lead.

## 1. Baseline audit on the published 0.9.0 packages

- [x] 1.1 Prepare two clean worktrees of the application (npm install, Bun install), each with its own database, port and environment file; verify each install completes and record what each package manager did with the patched dependency.
- [x] 1.2 Write the request harness (authentication, 25 routes by actor, declared errors, validation edges, full create/read/update/delete lifecycles, event reaction, realtime channel, signed-URL upload, system routes); verify it runs on Node and on Bun and writes one JSON line per request plus a summary.
- [x] 1.3 Run the harness in the npm environment and in the Bun environment; verify both summaries exist and every failed row keeps its request, response and request id.
- [x] 1.4 Run the command surface in both environments (install, check, typecheck, migrate, dev with reload and clean stop, graph, build, start, inspector, unit and integration tests); verify output, exit code and duration are recorded for each.
- [x] 1.5 Walk every Inspector page against the harness traffic, launched under npm and under Bun; verify each page has a verdict (correct, wrong, missing, ambiguous) with a screenshot and any console or network error.

## 2. Report and triage

- [x] 2.1 Trace every failure to its cause in source and classify it (RelKit, Inspector, application, documentation, by design); verify a sample of each class by re-running it.
- [x] 2.2 Write `evidence/baseline-report.md` with the RelKit list and the Inspector list, each finding with id, environment, reproduction, expected and actual result, cause and severity; verify it contains no machine paths.
- [x] 2.3 Add one task group per file-ownership area and one spec delta per affected capability, update the proposal's change list; verify `openspec validate fix-logistics-audit-findings --strict` passes.

## 3. Connection safety and body limits

**Findings:** RK-01, RK-09, RK-21, RK-24 (header). **Owns:** `packages/relkit/src/runtime-hono/{http-span,middleware-limits,middleware,better-auth-mount,request-body-service,control-plane}.ts`, `packages/cli/src/supervisor/proxy-{forward,request,body}.ts`.

- [x] 3.1 RK-01, runtime: add a test that sends a cross-origin `POST` with a slowly streamed body to a served application, then a valid request on the same connection, and repeat it for the other early answers (413, 404, 405, route-level 401, not ready); make `instrumentHttpRequest` (`http-span.ts:86-147`) consume the unread body up to the body limit or answer with `Connection: close`; verify the second request always gets its normal response, on the Bun and Node adapters (`packages/relkit/tests/runtime-hono/`, `packages/cli/tests/server-runtime/production-app/service.test.ts`).
- [x] 3.2 RK-01, development proxy: add the same two-request test through the proxy with real listeners (`packages/cli/tests/supervisor/proxy/`); when the upstream answers before the client body has ended, stop sending, do not return that upstream connection to the pool, and keep the client's `Content-Length` when it sent one (`proxy-forward.ts:6,42-44`, `proxy-request.ts:51-69`); verify 0 bare 400 responses in 300 repetitions of the reproduction in `evidence/baseline-report.md`.
- [x] 3.3 RK-09: enforce `maxBodyBytes` on the bytes read for every route, including the Better Auth mount and bodies without `Content-Length` (`middleware-limits.ts:28-62`, `better-auth-mount.ts:22-30`); verify a chunked 5 MiB sign-up is rejected and the handler never receives it (`packages/relkit/tests/runtime-hono/middleware.test.ts`).
- [x] 3.4 RK-21: answer an oversize body with 413 and the existing code `payload-too-large` in both the header path and the streamed path, in development and production; change the existing http-runtime requirement with a MODIFIED delta that keeps the rest of its text; verify both paths and `openspec validate --strict`.
- [x] 3.5 RK-24: set `x-request-id` on control-plane responses without recording them (`http-span.ts:91`, `control-plane.ts:10-13`); verify every response of the harness's system group carries the header.

## 4. Server shell: mode, exposure, bind address, logs

**Findings:** RK-02, RK-03, RK-07, RK-25, RK-28, RK-29. **Owns:** `packages/cli/src/commands/{build-server-http,build-server-http-options,build-server-runtime-support,build-server-identity,build-server-bootstrap,dev-session-native,dev-log-format}.ts`, `packages/cli/src/commands/start.service.ts`, `packages/cli/src/supervisor/candidate-process.ts`, `packages/relkit/src/runtime-hono/{core-endpoints,internal-endpoints,internal-endpoints-utils}.ts`.

- [x] 4.1 RK-02: test that a built application started through `relkit start` with neither `RELKIT_ENV` nor `NODE_ENV` reports production mode, serves no API documentation and no graph probe; set `RELKIT_ENV=production` in `start.service.ts:86-90` unless the operator set it; state it in the environment documentation; verify on the Bun and Node builds.
- [x] 4.2 RK-03: reduce the core graph probe to hashes and versions (`internal-endpoints.ts:115-137`, stop passing the full graph at `build-server-http-options.ts:142`); update its consumers (`scripts/scaffold-dev-contracts.ts`, `tests/unit/scaffold-dev-contracts.test.ts`, supervisor verification); verify the probe body contains no source path, permission name or environment variable name, and that activation and the Inspector still work (`packages/relkit/tests/runtime-hono/internal-endpoints.test.ts`).
- [x] 4.3 RK-07: pass the candidate's host to the generated server and bind to it, keeping `0.0.0.0` only for built servers that set no host (`build-server-http.ts:85`, `candidate-process.ts:45-66`); verify no development listener is bound to a non-loopback address (`packages/cli/tests/supervisor/candidate/`).
- [x] 4.4 RK-28: return only status and readiness from the health endpoints in production, keeping identity fields in development where the supervisor reads them; verify both modes.
- [x] 4.5 RK-25: answer blocked and unknown internal paths, and internal endpoint errors, as Problem Details with `x-request-id` (`dev-session-native.ts:48-51,68-72`, `internal-endpoints.ts:62,68-69`, `core-endpoints.ts:19-21`); verify the harness's error-shape rows for these paths.
- [x] 4.6 RK-29: log 4xx at info except 401, 403 and 429 at warn; keep `→ <status> in <n>ms` on the request line for long paths; never cut a name in the middle (`build-server-http.ts:54`, `dev-log-format.ts:80-110,165`); verify with formatter tests in `packages/cli/tests/commands/`.

## 5. Failure and request mapping

**Findings:** RK-04, RK-08, RK-10, RK-11, RK-22, RK-23, RK-24 (body), RK-27, and the recording that IN-03, IN-05, IN-06 need. **Owns:** `packages/relkit/src/runtime-hono/{response-mapping,response-mapping-encode,response-mapping-provider,response-mapping-utils,request-inference,request-mapping,request-mapping-fields,request-mapping-object,request-mapping-body,request-mapping-body.schemas,materialize-routes-utils,transport-security}.ts`, `packages/relkit/src/engine/{access,invocation-execution}.ts`, `packages/relkit/src/contracts/problem-details.ts`.

- [x] 5.1 RK-04, IN-03: change the test that expects the cause in the development response (`packages/relkit/tests/runtime-hono/response-mapping.test.ts:221`) to expect a generic detail in every mode; write the redacted cause once to the error log and as an `exception` event on the invocation span, with request ID and trace ID (`response-mapping-encode.ts:76-81`, `response-mapping-provider.ts:14-18`, `engine/invocation-execution.ts:139-145`); verify a driver error with a query in its message leaks nothing in the body and appears in the log.
- [x] 5.2 IN-05, IN-06: record on the invocation span the declared error identifier of an application failure, and on the `http.validation.failed` event each issue's code and path, never values (`materialize-routes-utils.ts:93-95`); verify with a telemetry test that a 409 and a 422 carry them.
- [x] 5.3 RK-08: reject a caller without a session, or failing a rule that does not read input, before input validation (`materialize-routes-utils.ts:85-95`, `engine/access.ts`); verify 401 and 403 name no field, and that rules reading input still run after validation (`packages/relkit/tests/runtime-hono/access.test.ts`).
- [x] 5.4 RK-10: coerce strings only for path, query, header and cookie values (`request-inference.ts:18-23,67-73`); verify `"3500"` in a JSON body fails an integer field while `?limit=50` still works (`request-materialization.test.ts`).
- [x] 5.5 RK-11: reject a JSON body that is not an object with a new issue code `body-not-object` when the route maps body fields (`request-mapping-fields.ts:19`, `request-mapping-object.ts:70-75`); verify `null`, an array and a string on `POST` and `PATCH` (`request-mapping.test.ts`).
- [x] 5.6 RK-22, RK-27: set an explicit `Content-Length`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on JSON and Problem Details responses unless the route declares caching (`response-mapping-utils.ts:103-108`); verify `HEAD` reports the `GET` length.
- [x] 5.7 RK-23: treat `OPTIONS` as a preflight only with `Access-Control-Request-Method` (`transport-security.ts:25-37`); verify the three harness `OPTIONS` rows (`transport-security.test.ts`).
- [x] 5.8 RK-24: add `requestId` beside `traceId` in Problem Details bodies; verify it equals the `x-request-id` header.
- [x] 5.9 RK-21: answer a body over a route's own limit with 413 `payload-too-large` like the server limit (`materialize-routes-utils.ts`, `response-mapping.ts`); verified by `request-mapping.test.ts` and `tests/integration/http/http.test.ts`.
- [x] 5.10 RK-04: make the error record of an internal failure reach the development terminal with its request ID, by giving the generated server a log sink for framework error logs (`packages/cli/src/commands/build-server-http-options.ts`, `build-server-runtime-support.ts`); verify a failing handler under `relkit dev` prints one error line with the redacted cause.
- [x] 5.11 RK-23: answer an `OPTIONS` request that is not a preflight with 204 and `Allow` for a path that has routes (`runtime-hono/unmatched-route.ts:15-31`); verify the three harness `OPTIONS` rows and that an unknown path still answers 404.
- [x] 5.12 RK-24: carry `requestId` in the remaining Problem Details bodies (`runtime-hono/middleware-limits.ts`, `route-response.ts`, `response-mapping.types.ts`) and declare it in the generated Problem schema (`openapi/generate-response.ts`); verify every error response of the HTTP integration suite has `requestId` equal to its header.

## 6. Realtime, client and signed uploads

**Findings:** RK-12, RK-13, RK-19. **Owns:** `packages/relkit/src/runtime-hono/{realtime-observation,realtime-rpc,rpc,rpc-handler-options}.ts`, `packages/client/src/**`, `integrations/packages/s3/src/runtime/**`, `packages/relkit/src/buckets/**`, `packages/relkit/src/providers-local/buckets/**`, `packages/testing/src/buckets-conformance.ts`.

- [x] 6.1 RK-13: run the identity precondition before the stream is returned so the declared 409 applies (`realtime-rpc.ts:18-20`, `realtime-observation.ts:30-41`); verify with `packages/relkit/tests/runtime-hono/rpc-error-status.test.ts`.
- [x] 6.2 RK-19: make iteration over a subscription end when the caller's signal aborts, on Node and Bun (`packages/client/src/transport.service.ts:34-39`, `native/iterate.ts:36`); verify with a test that aborts after a replay plus a live event, 50 repetitions on Node.
- [x] 6.3 RK-12: let a signed upload URL bind a declared content type and length (optional arguments, existing calls unchanged), refuse types and sizes the bucket does not allow before signing, and sign the content type so storage rejects a different one (`integrations/packages/s3/src/runtime/signing.ts:54-64`, `s3.ts:185-189`, `packages/relkit/src/buckets/client-effects.ts:162-176`); add the cases to the bucket conformance suite; verify against the local provider and MinIO.
- [x] 6.4 RK-12: pass a declared bucket's `maxObjectBytes` and `allowedContentTypes` to the bucket client the application runtime builds (`packages/relkit/src/engine/dependency-clients.ts`), for descriptors and for manifest-bound references in generated servers, so a disallowed type or size is refused before signing and on `put` with every provider; verify in a generated application backed by the S3 provider that `createWriteUrl` refuses a type outside the bucket's list.

## 7. Contract, dependency pins and documentation

**Findings:** RK-20, RK-26, and the by-design items of the report. **Owns:** `packages/relkit/src/openapi/**`, `packages/better-auth/src/openapi.ts`, dependency versions in the root and package manifests, `apps/docs/content/docs/**` except the pages named by other groups.

- [x] 7.1 RK-26: declare 401 and 403 for operations with an access rule, the validation and oversize responses for operations with input, and 500, in the generated document (`generate-response.ts:70-110`); correct the Better Auth operation schemas the harness found wrong or record them as upstream; verify the harness contract group reports no undeclared status for application routes.
- [x] 7.2 RK-20: move `@hono/node-server` and the scaffolded `better-auth` version to releases without the advisories found by `npm audit`, or record why a pin must stay; verify `npm audit` on a fresh project attributes nothing to RelKit pins and the package suites pass.
- [x] 7.3 Document what is by design: 422 for malformed JSON and wrong content type and 413 `payload-too-large` for oversize (also for a route-level limit); request ID versus trace ID and how to find a request from either; dotenv precedence under `relkit dev` and for one-shot commands; the generated OpenAPI file versus the served document; the release-source rule for local-only bindings; that the Inspector's interface needs Node.js on `PATH` (also under `bun --bun`) and what its status fields mean; verify the pages' own tests (the generated reference pages are regenerated once, in task 21.1).

## 8. Environment files and database commands on Node

**Findings:** RK-06, RK-31. **Owns:** `packages/cli/src/database/**`, `packages/cli/src/commands/{db,env}.ts`, `packages/cli/src/cli-help-db.ts`, new `packages/cli/src/runtime/one-shot-environment.ts`, `examples/data-model/tests/migrations.test.ts`.

- [x] 8.1 RK-06: on Node, load the application's environment files for `db migrate`, `env check` and `env list`, with process values taking precedence, through one helper; verify `npm run db:migrate` with `DATABASE_URL` only in `.env`, and `env check` reporting it as set.
- [x] 8.2 RK-06: show the configuration's own message when the Drizzle configuration throws, and distinguish a missing dependency from a thrown error (`migration-config.ts:24-31`); verify with a configuration that throws.
- [x] 8.3 RK-31: report how many migrations were applied, or that the database is up to date (`commands/db.ts:64`, `migration.schemas.ts`); name the project's package manager in the "generate first" message (`migration-execute.ts:37`); state the environment and configuration inputs in `db migrate --help`; verify a first and a repeated run.

## 9. Database scaffold for Node

**Findings:** RK-05, RK-35. **Owns:** `packages/cli/src/scaffolding/{render-database*,plan-builder-manifest}.ts`, `packages/create-relkit/src/**`, `templates/**`, `examples/{data-model,commerce}/**`, `packages/drizzle/src/**`, `packages/create-relkit/src/dependency-patches.ts`, `apps/docs/content/docs/modules/deployment/runtimes.mdx`, `tests/generator/**` for the database scaffold.

- [x] 9.1 RK-05: add a runtime-selecting PostgreSQL and MySQL client to `@relkit/drizzle`, mirroring `openSqliteDatabase`, and render the database service with the runtime-selecting client for every dialect (`render-database-sources.ts:18-21`); replace the `bun --bun drizzle-kit generate` script; change the cli-scaffolding requirement that mandates the Bun-native SQLite driver with a MODIFIED delta; verify generated projects pass `check` on Node and on Bun for each dialect.
- [x] 9.2 RK-35: write `patchedDependencies` only for package managers that apply it and tell the user when a declaration-only repair is skipped; write the install-script approval npm needs; verify the manifest created with npm, pnpm and Bun.
- [x] 9.3 RK-35: on the `relkit add` path, show the skipped-repair notice as a warning and, for pnpm, write the patch entry where pnpm reads it (`packages/cli/src/scaffolding/plan-builder-manifest.ts`, `pnpmWorkspacePatchEffect`); put the creation notice into the result's warnings so non-interactive and JSON output carry it (`packages/create-relkit/src/generate-result.ts`); verify `relkit add database` in an npm project and a pnpm project.
- [x] 9.4 RK-05: move the remaining Bun-only database examples to the runtime-selecting clients: the skill reference in every template (`templates/default/v1/*/.agents/skills/relkit/references/data-apis.md`, with the template digest) and the sample applications `examples/data-model` and `examples/commerce`; declare `pg` and `mysql2` in the Drizzle package's integration metadata; verify the examples' own suites and the template digest test.

## 10. Check diagnostics, provider locations and doctor

**Findings:** RK-14, RK-15, RK-17, RK-32, IN-33. **Starts after group 8 is merged.** **Owns:** `packages/cli/src/commands/{check,check-support,check-dependencies,check-route-modules,check-result,doctor-*}.ts`, `packages/cli/src/commands/doctor-project.service.ts`, `packages/cli/src/compiler/discovery/evaluator-child-framing.ts`, `packages/cli/src/compiler/normalize-{provider-validation,pass-support,graph-app,graph-providers}.ts`, `packages/relkit/src/diagnostics/codes/compiler.ts`, the graph entry of `packages/relkit/src/diagnostics/codes/cli.ts`.

- [x] 10.1 RK-14: report a Bun-only import evaluated on Node with a new code at the import line, naming the runtime and the alternatives, from the import preflight (`check-dependencies.ts:34-79`); verify with a fixture importing `bun:sqlite` and one importing `drizzle-orm/bun-sql`.
- [x] 10.2 RK-15: skip the type check when evaluation failed, and make `relkit graph` say that the last check failed when diagnostics hold errors (`check.ts:43-58`); verify one error for one failing import.
- [x] 10.3 RK-32: point provider binding diagnostics at the binding's entry and name a valid replacement (`normalize-provider-validation.ts:88-108`, `normalize-pass-support.ts:121-136`); verify the line for a local-only bucket.
- [x] 10.4 IN-33: give environment variable and provider binding nodes the location of their own declaration instead of the `defineApp` call (`normalize-graph-app.ts:122-125`, `normalize-graph-providers.ts:36-39`); verify the graph of a fixture with an env module and a bucket binding.
- [x] 10.5 RK-17: add doctor checks for imports the current runtime cannot load, environment files the current runtime will not read, and manifest fields the package manager ignores; verify on a Node project with a Bun-only service.
- [x] 10.6 RK-06: use the one-shot environment helper (`packages/cli/src/runtime/one-shot-environment.ts`) for the values `start`, `jobs`, `local` and `doctor` read from the environment (`start.service.ts:57`, `jobs-base-url.ts`, `jobs-http.ts`, `local-operations.ts`, `doctor-project.service.ts:123`); verify on Node that `PORT` set only in `.env` is honoured by `relkit start`.
- [x] 10.7 IN-20: emit, for every function with an access rule, a `checks-session` edge to the authentication service and a `depends-on-service` edge from the function's service to it (`packages/cli/src/compiler/normalize-graph-*.ts`); verify the graph of a fixture with a protected function and that the Inspector's domain view lists the users of the auth domain.

## 11. Command line messages and help

**Findings:** RK-16, RK-30, RK-33, RK-34. **Owns:** `packages/cli/src/{main,main-support,main-effect,cli-effect-runtime,local,invocation-signals,cli-help-builders,cli-help-model,command-project}.ts`, `packages/cli/src/commands/start-built-workflow.ts`, the entries of `packages/relkit/src/diagnostics/codes/cli.ts` other than the graph entry.

- [x] 11.1 RK-16: fail `relkit start` without a build with a new `RELKIT_*` code that names `relkit build`, and stop native error codes from being printed as RelKit codes (`start-built-workflow.ts:46-51`, `main-support.ts:161-162`); verify the message and exit status.
- [x] 11.2 RK-30: on an interrupt or termination signal print one neutral line in human output and keep the exit status and the JSON output (`main.ts:63-73`); verify with `packages/cli/tests/invocation/signals.test.ts`.
- [x] 11.3 RK-33: report an unknown command as unknown with the available commands (`cli-effect-runtime.ts:132-139`); verify the text and that suggestions still appear for near misses.
- [x] 11.4 RK-34: give each command real examples, the `--runtime` default, the build prerequisite of `start`; add `--include-outputs` to `check --json` and omit generated file bodies without it only if no consumer in this repository reads them, otherwise leave the shape and record why; verify the help snapshots and the generated CLI reference.

## 12. Reload after a compile failure

**Findings:** RK-18, IN-28 (events). **Starts after group 4 is merged.** **Owns:** `packages/cli/src/supervisor/**` except `proxy-*.ts`, `packages/cli/src/commands/dev-{engine,activation,command}*.ts`.

- [x] 12.1 RK-18: reproduce with a test that saves a syntax error and then a fix two seconds later; report the parse failure with file and line when the candidate fails instead of waiting for the health timeout; start the rebuild for the later change as soon as it arrives; verify the failure is reported and the fix is serving within the reload budget.
- [x] 12.2 IN-28: add a session identifier and a reason (`start` or `reload`) to the generation events (`dev-activation.ts:129-137`); verify a restart and a reload produce distinguishable events.
- [x] 12.3 RK-07: forward a programmatic candidate host to the child environment (`supervisor/candidate-start.ts:43`), so a custom host is honoured by the generated server; verify with the supervisor environment test.
- [x] 12.4 RK-18, RK-14: put the file, line and column of a parse error into the evaluator's import failure, so `relkit dev` and `relkit check` name the syntax error's own location instead of line 1 and "2 errors building <absolute path>" (`packages/cli/src/compiler/discovery/evaluator-child-framing.ts` `importFailure`, the failure type, `packages/cli/src/commands/check-support.ts`); verify with the compile-failure test asserting the line and the message of the syntax error, and that no absolute path is printed.

## 13. Inspector launcher and session state

**Findings:** IN-46, IN-47, IN-48, and the tool side of IN-09, IN-17. **Owns:** `packages/inspector/src/{ui-native.service,tool-main,tool-loop,tool.service,live-events,tool-backend,capture-loss,collector}.ts`, new `packages/inspector/src/node-executable.ts`, `packages/inspector/src/observability-local/local/worker-client-effect.ts`, `scripts/portability-baseline.json`, `tests/unit/package-engines.test.ts`, `packages/inspector/tests/**`.

- [x] 13.1 IN-46, IN-47: resolve a real Node executable (the running one on Node; on Bun, the first `node` on `PATH` that is not Bun's alias) and start the interface and the history worker with it through the runtime adapter's `processes.spawn` (`ui-native.service.ts:42`, `worker-client-effect.ts:38-39`); fail with a coded message naming Node when none is found; verify the Inspector reaches "listening" and serves a page when launched with Node, with `bun run`, and with `bun --bun run`.
- [x] 13.2 IN-46: remove the allow-list entry for the launcher (`scripts/portability-baseline.json`) and make the engines test fail when a package that declares Node keeps Bun call sites on the allow-list without a stated reason; verify the test fails on the old baseline and passes on the new one.
- [x] 13.3 IN-48, IN-09: log once when no development session is found and on every connect and disconnect, and always publish the current selection to a new stream subscriber (`tool-loop.ts:74-100`, `live-events.ts:21-42`); verify with `packages/inspector/tests/tool-recovery.test.ts`.
- [x] 13.4 IN-17: report records lost before history and missed live updates as separate named fields from the tool backend; verify the fields against a forced overflow.
- [x] 13.5 Keep a baseline entry's stated reason and guard when the portability baseline is lowered (`scripts/portability.ts`); verified by `tests/unit/portability.test.ts`.

## 14. Inspection API and host wiring

**Findings:** IN-02, IN-07, IN-11, IN-12, IN-13, IN-29 (edges), IN-32, IN-34. **Starts after group 4 is merged.** **Owns:** `packages/relkit/src/inspector-api/{graph-utils,graph,actions-utils,actions.types,actions-dispatch,actions-dispatch-start,actions,shared,events-query}.ts`, `packages/cli/src/commands/{build-server-http-inspector,build-server-inspector-runtime,build-server-invocation,build-server-runtime-support}.ts`, `packages/relkit/src/providers-local/events/admin*.ts`, `packages/relkit/src/runtime-hono/{agent-inspector,create-app,create-inspection-app}.ts`, `packages/relkit/src/inspector-api/connection/files-native.ts`.

- [x] 14.1 IN-07: pass channel `params`, `replay` and `presence` through the graph projection (`inspector-api/graph-utils.ts:6-18`); verify the channel node of a fixture with parameters and a replay window.
- [x] 14.2 IN-02: keep the application's status and safe code in a rejected action's body instead of collapsing them (`actions-utils.ts:207-224`); verify an invoke that the application answers with 401.
- [x] 14.3 IN-34: return the number of matching items with every graph and runtime page (`inspector-api/shared.ts:96-102`, `events-query.ts:74`); verify a collection larger than one page.
- [x] 14.4 IN-11: forward the originating request and span links through the generated invoke (`build-server-invocation.ts:19-46`); verify with `tests/inspector/generated-runtime-wiring.test.ts` that an event reaction is a continuation of its request.
- [x] 14.5 IN-12, IN-13: provide event publish and replay in the generated development server through the application's own event client and the local event log, validating the payload against the event schema; where replay cannot be provided for a provider, report it as unsupported for that provider instead of unavailable; verify publish and replay end to end against the local provider.
- [x] 14.6 IN-29, IN-32: report observed dynamic calls of the active generation and each resource's runtime state from the generated server (`build-server-http-inspector.ts:17-49`, `build-server-runtime-support.ts:15-20`); verify a function that writes to a bucket and publishes an event shows both edges.
- [x] 14.7 RK-03: take the agent workflow and executions routes off the application port, or put them behind the inspection session token, without closing the development API documentation (`runtime-hono/agent-inspector.ts:30-44` and its callers); verify they answer 404 or 401 without the token.
- [x] 14.8 IN-48: stop the Inspector printing an error line every second while no connection directory exists, by treating a missing path as absence before the operation is observed (`packages/relkit/src/inspector-api/connection/files-native.ts:103`); verify an Inspector started without a development session prints the waiting line once and no error.
- [x] 14.9 IN-20, IN-21, IN-18: let the new history filters and count reach the stores over HTTP (`inspector-api/observability-utils.ts` `readObservabilityQuery`: `status`, `method`, `path`, `errorId`, `count`), list the system routes in the routes collection (`inspector-api/graph-projection.ts`, `systemRouteNodes` from `relkit/observability`), and pass the new `exportCapacityRejections` counter (`inspector-api/runtime-metadata.ts`); verify each through the inspection API of a generated runtime.
- [x] 14.10 IN-21: carry the message of a rejected history query to the interface: the error body of the history API and of the Inspector's backend keeps the query error's message, which names the parameter (`packages/relkit/src/inspector-api/observability.ts` `safeErrorResponse`, `packages/inspector/src/backend-history.ts` `backendError`), and the interface's transport reads it (`apps/inspector/lib/api-transport.ts`); verify a rejected filter shows the server's message at its field.

## 15. Telemetry truth

**Findings:** IN-16 (count), IN-18, IN-19, IN-20, IN-21, IN-22, IN-24, IN-29 (logs). **Starts after groups 3, 4 and 5 are merged.** **Owns:** `packages/relkit/src/runtime-hono/{http-response,request-record-middleware,request-record-utils}.ts`, `packages/relkit/src/providers-local/events/{provider,delivery-utils,delivery-inspection}.ts`, `packages/relkit/src/providers-local/jobs/queue.ts`, `packages/relkit/src/observability/{runtime-pipeline,remote-runtime-core,query.types,query-validation-core,query-page-effect}.ts`, `packages/relkit/src/runtime-effect/logger-record.ts`, `packages/inspector/src/observability-local/local/duckdb-query-*.ts`; after the merges also `runtime-hono/better-auth-mount.ts` and the system endpoint registrations for 15.4.

- [x] 15.1 IN-24: record the status that was sent when a client ends a streamed response, keeping `cancelled` as the outcome (`http-response.ts:45,55-56,195-204`, `request-record-middleware.ts:58-59,92`); verify a subscription the client closes is recorded as 200.
- [x] 15.2 IN-19: stop recording success logs for provider polling and inspection, and read the queue once per inspection query instead of once per stored record (`contracts/operation-observer.ts:29-32` default stays; `providers-local/events/provider.ts:109-127,176-179`, `delivery-utils.ts:116-125`); find what calls the event query while the application is idle and remove or throttle it; verify an idle minute records no such log and the query makes a bounded number of operations.
- [x] 15.3 IN-18: do not start the export queue when no exporter is configured, and count export failures by reason (`observability/runtime-pipeline.ts:16-21`, `remote-runtime-core.ts:90-98`); verify the counter stays at zero without exporters.
- [x] 15.4 IN-20: record requests handled by the authentication mount, health endpoints and RPC with stable route identifiers and list them as system routes; emit a graph edge from functions with an access rule to the authentication service; verify the harness's authentication requests are attributed and the auth domain lists its users.
- [x] 15.5 IN-21, IN-22, IN-16: add status, method, path and declared error identifier filters, text search and a match count to history queries, in the query contract and the DuckDB store; verify each filter and the count against a seeded history.
- [x] 15.6 IN-29: carry the function identifier on logs written inside an invocation (`runtime-effect/logger-record.ts:75`); verify provider operation logs of a request are found by function.
- [x] 15.7 IN-13, IN-14: expose retry, a true re-delivery of a stored publication, and per-state delivery counts from the local event provider (`providers-local/events/provider.ts`, `delivery-utils.ts`), so the Inspector's retry works on a dead-lettered delivery, replay keeps the publication's identity, and the event page can show counts; verify through the inspection API of a generated runtime.

## 16. Inspector pages: requests and request detail

**Findings:** IN-01, IN-03, IN-04, IN-05, IN-06, IN-21, IN-23, IN-35, IN-36, IN-37. **Starts after groups 5 and 15 are merged.** **Owns:** `apps/inspector/lib/{observability-model,signal-defaults,graph-index,format,trace-*}.ts`, `apps/inspector/app/{signals-client,signals-filters,command-palette,signal-rows}.tsx`, `apps/inspector/app/signal-detail-*.tsx`.

- [x] 16.1 IN-01, IN-21: request the list newest first, add status, method, path and text filters, and keep filters and page in the URL (`lib/observability-model.ts:56-68`, `app/signals-client.tsx`); verify with `observability-model.test.ts` and `tests/e2e/inspector-requests.spec.ts` that page 1 holds the newest request and a filtered URL reloads to the same view.
- [x] 16.2 IN-03, IN-05, IN-06: show on a failed request the declared error with a link to its contract, the validation issue codes and paths, and the recorded cause of an internal failure; verify each against a fixture record.
- [x] 16.3 IN-04: replace the headers and bodies panel with the invocation's captured input and result, and state that HTTP headers and bodies are not recorded (`app/signal-detail-sections.tsx:44-57`); verify with `tests/e2e/inspector-payload.spec.ts`.
- [x] 16.4 IN-23, IN-35, IN-36: count unique spans, use one time formatter that shows the zone, and one request-label helper for live and loaded rows; verify with `lib/trace-view.test.ts`.
- [x] 16.5 IN-37: focus the command palette's input when it opens and resolve request and trace identifiers; verify by keyboard in the browser.
- [x] 16.6 IN-21: show the server's message for a rejected filter at the field its `parameter` names, and as the list's message otherwise (`apps/inspector/app/use-request-history.ts`, `app/signals-client.tsx`); verify with a unit test of the mapping and the requests spec.

## 17. Inspector pages: actions and resources

**Findings:** IN-02, IN-08, IN-12, IN-13, IN-14, IN-15, IN-22, IN-25, IN-26, IN-27, IN-31, IN-32, IN-34, IN-38, IN-39, IN-40. **Starts after group 14 is merged.** **Owns:** `apps/inspector/app/{functions,events,channels,routes,jobs,errors}/**`, `apps/inspector/app/{resource-*,provider-list,schema-form,environment-client}.tsx`, `apps/inspector/lib/{inspector-actions,events-model,schema-model,resources-model,api-transport,api-request-utils,api-validation}.ts`.

- [x] 17.1 IN-02, IN-08, IN-26: show the application's answer and say that Inspector actions run without a user session when it refused; prefill channel parameters from the declared schema; make the route composer's status line reflect the response status; verify invoke, connect and send against a protected fixture.
- [x] 17.2 IN-12, IN-13: validate the payload against the event schema, ask for confirmation before publish and replay, and show the outcome beside the control in plain language; verify with `lib/inspector-actions.test.ts` and in the browser.
- [x] 17.3 IN-14, IN-15, IN-34: show totals from the API ("20 of 23", "100 of n") and give delivery and publication rows their time, payload preview and trace link; verify on an event with more deliveries than one page.
- [x] 17.4 IN-27, IN-38: read the response status before the protocol envelope so a 404 means "none declared" (`lib/api-transport.ts:72-86`), and give jobs, middlewares, agents and tools empty states that distinguish "none declared" from "no match"; verify with `lib/api.test.ts` and an application without jobs.
- [x] 17.5 IN-22: show occurrences per declared error and the internal failures on the Errors page; verify against a seeded history.
- [x] 17.6 IN-25, IN-31, IN-32, IN-39, IN-40: show object content type and modified time and flag a type that contradicts the key; give the PDF preview a fallback with metadata; word provider provenance as provenance and show reported runtime state; label fields from the input schema; fix the overflow of the environment page at 900 px; verify each in the page walk.
- [x] 17.7 IN-20: show the system routes the API now lists (authentication mount, health, RPC) in their own labelled section of the Routes page, each with its requests, without counting them as declared routes and without offering "send request" for a prefix; update the end-to-end specs that count routes; verify against a run with authentication requests.

## 18. Inspector pages: shell, overview and streams

**Findings:** IN-09, IN-10, IN-16, IN-17, IN-18, IN-28, IN-41, IN-42, IN-43, IN-45, IN-48. **Starts after groups 12, 13 and 15 are merged.** **Owns:** `apps/inspector/app/{layout,not-found,inspector-shell,overview-shell,runtime-status}.tsx`, `apps/inspector/app/overview/**`, `apps/inspector/app/graph/**`, `apps/inspector/lib/{stream*,client,use-graph,use-development-failure,development-failure,use-signal-page,overview-model}.ts`.

- [x] 18.1 IN-09, IN-10, IN-48: track the application session state separately from the Inspector stream, show an "application unreachable" banner on every page, and a "waiting for a development session" state with how to start one; verify by stopping and starting a development server while pages are open.
- [x] 18.2 IN-43: use one event stream per tab and replace the three-second log poll with the generation event; verify three tabs stay connected and the idle request rate.
- [x] 18.3 IN-16, IN-17, IN-18, IN-28: label sampled tiles as sampled or use the match count; show lost records and missed live updates as separate named numbers; hide export failures when no exporter is configured; label generation history entries as session start or reload; verify against the baseline run's numbers.
- [x] 18.4 IN-41, IN-42, IN-45: follow the system colour scheme until the user chooses one; add a not-found page without a hydration error; make graph cards legible at the default fit, theme the zoom control and give a bucket its node; verify in the page walk in both themes.
- [x] 18.5 IN-35, IN-36: use the shared request label and time formatter on the remaining pages (`lib/overview-model.ts` `pathOf`, `components/neon/history-list.tsx`, `app/trace-waterfall.tsx`, `app/logs/**`), so live and loaded rows read the same and every time shows its zone; verify with unit tests.
- [x] 18.6 Make the Inspector application's own `check` script type-check its sources (today its configuration lists no files, so it checks nothing) and fix the errors it then reports; verify `bun run check` in `apps/inspector` fails on an introduced type error and passes on the branch.
- [x] 18.7 IN-09: report from the Inspector's status endpoint whether a development session was ever connected in this run and the last session's identifier and end time (`packages/inspector/src/tool-backend.ts`, `tool-loop.ts`), and use it in the interface instead of the per-tab memory, so "stopped answering" and "waiting for a session" are told apart in every tab; verify with a tool test and the application-state unit tests.
- [x] 18.8 Run the whole Inspector end-to-end suite once on the merged pages and fix every failure that is not a screenshot baseline (known: the Routes heading now matches two headings in `tests/e2e/inspector.spec.ts`; the jobs status select in `tests/e2e/inspector-redesign.spec.ts`); list the screenshot baselines that must be regenerated in CI; verify the suite's non-screenshot tests all pass.

## 19. Node acceptance coverage

**Starts after groups 8, 9 and 13 are merged.** **Owns:** `scripts/node-creation-smoke*.ts`, the Node acceptance job in `.github/workflows/checks.yml`.

- [x] 19.1 Extend the Node creation acceptance run (npm, no Bun) to add a database, migrate it from `.env`, run `check`, add and start the Inspector until it listens, and run `start` without a build expecting the coded diagnostic; verify the run locally from packed archives.

## 20. The audited application

**Starts after group 9 is merged.** In the application's repository, branch `audit-fixes`.

- [ ] 20.1 Declare `@relkit/client`, commit the request harness and the Inspector walk under `scripts/audit/`, and correct the README (runner per script, npm, the two inexact sentences); verify `typecheck` and the unit suite.
- [ ] 20.2 Move the database service to the runtime-selecting client so the application runs on Node; verify `npm run check`, `npm run dev` and `npm run db:migrate` against the packed candidates.

## 21. Re-audit and integration

- [ ] 21.1 Merge every group, resolve seams, regenerate the generated documentation pages and snippets (`bun run --cwd apps/docs generate`) and pass their freshness check, and run once on the merged branch with nothing else running: the full `packages/relkit` suite, `test:packages`, `test:inspector`, the Inspector end-to-end suite, `typecheck`, `check`, `lint`, `konsistent`, then `prepush`; verify all pass.
- [ ] 21.2 Pack candidates from the merged branch and install them through the fixture registry with isolated caches into fresh npm and Bun worktrees of the application; verify the installed files come from the candidates.
- [ ] 21.3 Re-run the request harness and the command surface in both environments, including `npm run dev` on Node; verify every baseline failure passes or is recorded as by design with its diagnostic, and no row regressed.
- [ ] 21.4 Re-run the Inspector page walk and the interactive checks; verify each `IN` finding with a before and after capture.
- [ ] 21.5 Have the full diff reviewed without the lead's notes, and run exploratory requests outside the harness matrix; verify every confirmed finding is fixed or recorded.
- [ ] 21.6 Write `evidence/final-report.md` with the state of every finding per environment, the deferred items and their reasons; verify `openspec validate fix-logistics-audit-findings --strict`.

## 22. Testing harness parity

**Findings:** RK-36 (the application's tests avoid the in-process client because it "does not evaluate function access rules"), and the testing side of RK-12. **Owns:** `packages/testing/src/**` except `buckets-conformance*.ts`, `packages/testing/tests/**`.

- [x] 22.1 RK-36: write a test that calls a route with an access rule through the in-process HTTP client of `@relkit/testing` as an anonymous caller, a caller without the permission and a permitted caller; if the rule is not evaluated, make the harness run the same access path as the served application; verify 401, 403 and success, and that existing harness tests still pass.
- [x] 22.2 RK-12: bind a bucket's declared limits to the clients the harness wires for replacement providers (`packages/testing/src/provider-replacements.ts`, `bindBucketPolicy` from `relkit/engine`); verify a replacement provider refuses a disallowed upload in a harness test.

## 23. Better Auth release without the advisories

**Findings:** RK-20 (the part group 7 could not close). **Owns:** the `better-auth` catalog pin and the manifests the sync script rewrites, `packages/better-auth/**`, `packages/cli/src/scaffolding/render-auth*.ts`, `examples/auth-drizzle/**`, the auth pages of the documentation, `docs/dependencies.md`.

- [x] 23.1 RK-20: move the scaffolded and tested `better-auth` version to the first release without the advisories `npm audit` reports (1.7.7 or later in the same minor line), make the generated authentication schema, the examples and the package's tests match what that release accepts (it rejects the `account.issuer` column the current schema declares), and give existing projects a documented way forward (a `relkit migrate` rule or a doctor finding with the exact schema change and migration to run); verify the Better Auth package suite, a generated project with authentication on Bun and on Node, and that `npm audit` on a fresh project with authentication and a database attributes nothing to a version RelKit pins or writes.

## 24. Package manager neutrality of `relkit add`

**Findings:** RK-37, RK-38. **Owns:** `packages/create-relkit/src/package-manager.ts`, `packages/cli/src/scaffolding/**` and `packages/cli/src/commands/add*.ts` for the install step and the printed next steps.

- [x] 24.1 RK-37: make the install that `relkit add` runs succeed in a pnpm, npm and Bun project when `CI` is set, by telling each package manager that the lockfile may change (`packages/create-relkit/src/package-manager.ts`, around line 58), without changing what a plain install does elsewhere; verify with a test per manager and the pnpm leg of the Node acceptance run.
- [x] 24.2 RK-38: name the project's package manager in every message `relkit add` prints (the failed-install text and the next steps), and in the other commands' next steps where the scan finds a hard-coded `bun`; verify with tests for an npm and a pnpm project.
- [x] 24.3 RK-38: make the diagnostics catalogue and the launcher name no package manager's command where the project may use another (`packages/relkit/src/diagnostics/codes/{cli,compiler,mcp,launcher,inspector}.ts`, `packages/relkit/src/launcher/index.ts`): say what to install or run and give the npm, pnpm and Bun forms only where a command is needed; run the type check of `relkit migrate layout` with the project's package manager (`packages/cli/src/migration/layout-validation.ts`); verify the catalogue tests, the launcher tests and a failed `relkit add` in an npm project.

## 25. Same-origin requests under `relkit dev` on Node

**Findings:** RK-39, RK-40, RK-41, RK-42. **Owns:** the request forwarding of the development proxy and the generated server on Node (`packages/cli/src/supervisor/proxy-*.ts`, `packages/cli/src/commands/build-server-http.ts` `forwardedRequest`, `packages/relkit/src/runtime/node/**`), `packages/relkit/src/runtime-hono/transport-security.ts`, `scripts/node-creation-smoke-*.ts`.

- [x] 25.1 RK-39: write a test that starts `relkit dev` on Node and sends a `POST` with a JSON body and an `Origin` equal to the server's public origin, and the same on Bun; find why Node answers 403 `origin-denied` and fix it so the origin check compares against the origin the client used on every runtime; add a same-origin `POST` (and a cross-origin one expecting 403) to the `dev` step of the Node acceptance run; verify the test on both runtimes and the acceptance run for npm.
- [x] 25.2 Remove the remaining statements that Better Auth is kept at 1.7.1 or that the account table has an `issuer` column: the template skill reference (`templates/default/v1/*/.agents/skills/relkit/references/data-apis.md`, with the template digest), the documentation's tutorial project script and example steps under `apps/docs/scripts` and `apps/docs/examples`; verify the template consistency test, the digest test and the docs tests that read those examples.
- [x] 25.3 RK-40: write a test that starts `relkit dev` on Node and opens a WebSocket to the RPC endpoint with an `Origin` equal to the server's public origin (and one with another origin, expecting refusal), and the same on Bun; if Node refuses the same-origin socket, open the proxy's upstream socket on Node with a client that keeps `Host`, without trusting any forwarding header; verify the test on both runtimes, the proxy WebSocket tests, and a realtime subscription through the client under `relkit dev` on Node.
- [x] 25.4 RK-41: write a test that sends a `POST` with no body (with and without `Content-Length: 0`) to a handler that reports whether it received a body, under `relkit dev` on Node and on Bun and through the Node runtime adapter directly; make the Node path deliver a request without a body when the client sent none, and stop the development proxy from inventing a chunked body; verify the test on both runtimes and a Better Auth sign-out under `relkit dev` on Node.
- [x] 25.5 RK-42: write a test that sends bodies over the limit (just over, 2 MiB and 5 MiB, 50 times each, from a client that streams the body) through `relkit dev` on Node and requires 413 with a request id every time, no proxy-made 500 and no hang, and that the next request on a kept-alive connection is served (RK-01 stays fixed); make the proxy's Node client deliver an early answer without waiting for the rest of the body and without turning a write error after that answer into a failure; verify on Node and Bun.

