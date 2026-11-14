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

- [ ] 2.1 Trace every failure to its cause in source and classify it (RelKit, Inspector, application, documentation, by design); verify a sample of each class by re-running it.
- [x] 2.2 Write `evidence/baseline-report.md` with the RelKit list and the Inspector list, each finding with id, environment, reproduction, expected and actual result, cause and severity; verify it contains no machine paths.
- [ ] 2.3 Add one task group per file-ownership area and one spec delta per affected capability, update the proposal's change list; verify `openspec validate fix-logistics-audit-findings --strict` passes.

## 3. Connection safety and body limits

**Findings:** RK-01, RK-09, RK-21, RK-24 (header). **Owns:** `packages/relkit/src/runtime-hono/{http-span,middleware-limits,middleware,better-auth-mount,request-body-service,control-plane}.ts`, `packages/cli/src/supervisor/proxy-{forward,request,body}.ts`.

- [x] 3.1 RK-01, runtime: add a test that sends a cross-origin `POST` with a slowly streamed body to a served application, then a valid request on the same connection, and repeat it for the other early answers (413, 404, 405, route-level 401, not ready); make `instrumentHttpRequest` (`http-span.ts:86-147`) consume the unread body up to the body limit or answer with `Connection: close`; verify the second request always gets its normal response, on the Bun and Node adapters (`packages/relkit/tests/runtime-hono/`, `packages/cli/tests/server-runtime/production-app/service.test.ts`).
- [x] 3.2 RK-01, development proxy: add the same two-request test through the proxy with real listeners (`packages/cli/tests/supervisor/proxy/`); when the upstream answers before the client body has ended, stop sending, do not return that upstream connection to the pool, and keep the client's `Content-Length` when it sent one (`proxy-forward.ts:6,42-44`, `proxy-request.ts:51-69`); verify 0 bare 400 responses in 300 repetitions of the reproduction in `evidence/baseline-report.md`.
- [x] 3.3 RK-09: enforce `maxBodyBytes` on the bytes read for every route, including the Better Auth mount and bodies without `Content-Length` (`middleware-limits.ts:28-62`, `better-auth-mount.ts:22-30`); verify a chunked 5 MiB sign-up is rejected and the handler never receives it (`packages/relkit/tests/runtime-hono/middleware.test.ts`).
- [ ] 3.4 RK-21: answer an oversize body with 413 and code `body-too-large` in both the header path and the streamed path, in development and production; change the existing http-runtime requirement with a MODIFIED delta that keeps the rest of its text; verify both paths and `openspec validate --strict`.
- [ ] 3.5 RK-24: set `x-request-id` on control-plane responses without recording them (`http-span.ts:91`, `control-plane.ts:10-13`); verify every response of the harness's system group carries the header.

## 4. Server shell: mode, exposure, bind address, logs

**Findings:** RK-02, RK-03, RK-07, RK-25, RK-28, RK-29. **Owns:** `packages/cli/src/commands/{build-server-http,build-server-http-options,build-server-runtime-support,build-server-identity,build-server-bootstrap,dev-session-native,dev-log-format}.ts`, `packages/cli/src/commands/start.service.ts`, `packages/cli/src/supervisor/candidate-process.ts`, `packages/relkit/src/runtime-hono/{core-endpoints,internal-endpoints,internal-endpoints-utils}.ts`.

- [ ] 4.1 RK-02: test that a built application started through `relkit start` with neither `RELKIT_ENV` nor `NODE_ENV` reports production mode, serves no API documentation and no graph probe; set `RELKIT_ENV=production` in `start.service.ts:86-90` unless the operator set it; state it in the environment documentation; verify on the Bun and Node builds.
- [ ] 4.2 RK-03: reduce the core graph probe to hashes and versions (`internal-endpoints.ts:115-137`, stop passing the full graph at `build-server-http-options.ts:142`); update its consumers (`scripts/scaffold-dev-contracts.ts`, `tests/unit/scaffold-dev-contracts.test.ts`, supervisor verification); verify the probe body contains no source path, permission name or environment variable name, and that activation and the Inspector still work (`packages/relkit/tests/runtime-hono/internal-endpoints.test.ts`).
- [ ] 4.3 RK-07: pass the candidate's host to the generated server and bind to it, keeping `0.0.0.0` only for built servers that set no host (`build-server-http.ts:85`, `candidate-process.ts:45-66`); verify no development listener is bound to a non-loopback address (`packages/cli/tests/supervisor/candidate/`).
- [ ] 4.4 RK-28: return only status and readiness from the health endpoints in production, keeping identity fields in development where the supervisor reads them; verify both modes.
- [ ] 4.5 RK-25: answer blocked and unknown internal paths, and internal endpoint errors, as Problem Details with `x-request-id` (`dev-session-native.ts:48-51,68-72`, `internal-endpoints.ts:62,68-69`, `core-endpoints.ts:19-21`); verify the harness's error-shape rows for these paths.
- [ ] 4.6 RK-29: log 4xx at info except 401, 403 and 429 at warn; keep `→ <status> in <n>ms` on the request line for long paths; never cut a name in the middle (`build-server-http.ts:54`, `dev-log-format.ts:80-110,165`); verify with formatter tests in `packages/cli/tests/commands/`.

## 5. Failure and request mapping

**Findings:** RK-04, RK-08, RK-10, RK-11, RK-22, RK-23, RK-24 (body), RK-27, and the recording that IN-03, IN-05, IN-06 need. **Owns:** `packages/relkit/src/runtime-hono/{response-mapping,response-mapping-encode,response-mapping-provider,response-mapping-utils,request-inference,request-mapping,request-mapping-fields,request-mapping-object,request-mapping-body,request-mapping-body.schemas,materialize-routes-utils,transport-security}.ts`, `packages/relkit/src/engine/access.ts`, `packages/relkit/src/contracts/problem-details.ts`.

- [ ] 5.1 RK-04: change the test that expects the cause in the development response (`packages/relkit/tests/runtime-hono/response-mapping.test.ts:221`) to expect a generic detail in every mode; write the redacted cause once to the error log and to the request's span with request ID and trace ID (`response-mapping-encode.ts:76-81`, `response-mapping-provider.ts:14-18`); verify a driver error with a query in its message leaks nothing in the body and appears in the log.
- [ ] 5.2 IN-05, IN-06: record on the request's span the declared error code of an application failure and, for a validation failure, each issue's code and path (never values); verify with a telemetry test that a 409 and a 422 carry them.
- [ ] 5.3 RK-08: reject a caller without a session, or failing a rule that does not read input, before input validation (`materialize-routes-utils.ts:85-95`, `engine/access.ts`); verify 401 and 403 name no field, and that rules reading input still run after validation (`packages/relkit/tests/runtime-hono/access.test.ts`).
- [ ] 5.4 RK-10: coerce strings only for path, query, header and cookie values (`request-inference.ts:18-23,67-73`); verify `"3500"` in a JSON body fails an integer field while `?limit=50` still works (`request-materialization.test.ts`).
- [ ] 5.5 RK-11: reject a JSON body that is not an object with a new issue code `body-not-object` when the route maps body fields (`request-mapping-fields.ts:19`, `request-mapping-object.ts:70-75`); verify `null`, an array and a string on `POST` and `PATCH` (`request-mapping.test.ts`).
- [ ] 5.6 RK-22, RK-27: set an explicit `Content-Length`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on JSON and Problem Details responses unless the route declares caching (`response-mapping-utils.ts:103-108`); verify `HEAD` reports the `GET` length.
- [ ] 5.7 RK-23: treat `OPTIONS` as a preflight only with `Access-Control-Request-Method` (`transport-security.ts:25-37`); verify the three harness `OPTIONS` rows (`transport-security.test.ts`).
- [ ] 5.8 RK-24: add `requestId` beside `traceId` in Problem Details bodies; verify it equals the `x-request-id` header.

## 6. Realtime, client and signed uploads

**Findings:** RK-12, RK-13, RK-19. **Owns:** `packages/relkit/src/runtime-hono/{realtime-observation,realtime-rpc,rpc,rpc-handler-options}.ts`, `packages/client/src/**`, `integrations/packages/s3/src/runtime/**`, `packages/relkit/src/buckets/**`, `packages/relkit/src/providers-local/buckets/**`, `packages/testing/src/buckets-conformance.ts`.

- [ ] 6.1 RK-13: run the identity precondition before the stream is returned so the declared 409 applies (`realtime-rpc.ts:18-20`, `realtime-observation.ts:30-41`); verify with `packages/relkit/tests/runtime-hono/rpc-error-status.test.ts`.
- [ ] 6.2 RK-19: make iteration over a subscription end when the caller's signal aborts, on Node and Bun (`packages/client/src/transport.service.ts:34-39`, `native/iterate.ts:36`); verify with a test that aborts after a replay plus a live event, 50 repetitions on Node.
- [ ] 6.3 RK-12: let a signed upload URL bind a declared content type and length (optional arguments, existing calls unchanged), refuse types and sizes the bucket does not allow before signing, and sign the content type so storage rejects a different one (`integrations/packages/s3/src/runtime/signing.ts:54-64`, `s3.ts:185-189`, `packages/relkit/src/buckets/client-effects.ts:162-176`); add the cases to the bucket conformance suite; verify against the local provider and MinIO.

## 7. Contract, dependency pins and documentation

**Findings:** RK-20, RK-26, and the by-design items of the report. **Owns:** `packages/relkit/src/openapi/**`, `packages/better-auth/src/openapi.ts`, dependency versions in the root and package manifests, `apps/docs/content/docs/**` except the pages named by other groups.

- [ ] 7.1 RK-26: declare 401 and 403 for operations with an access rule, the validation and oversize responses for operations with input, and 500, in the generated document (`generate-response.ts:70-110`); correct the Better Auth operation schemas the harness found wrong or record them as upstream; verify the harness contract group reports no undeclared status for application routes.
- [ ] 7.2 RK-20: move `@hono/node-server` and the scaffolded `better-auth` version to releases without the advisories found by `npm audit`, or record why a pin must stay; verify `npm audit` on a fresh project attributes nothing to RelKit pins and the package suites pass.
- [ ] 7.3 Document what is by design: 422 for malformed JSON and wrong content type and 413 for oversize; request ID versus trace ID and how to find a request from either; dotenv precedence under `relkit dev` and for one-shot commands; the generated OpenAPI file versus the served document; the release-source rule for local-only bindings; verify the docs build and its link check.

## 8. Environment files and database commands on Node

**Findings:** RK-06, RK-31. **Owns:** `packages/cli/src/database/**`, `packages/cli/src/commands/{db,env}.ts`, `packages/cli/src/cli-help-db.ts`, new `packages/cli/src/runtime/one-shot-environment.ts`, `examples/data-model/tests/migrations.test.ts`.

- [ ] 8.1 RK-06: on Node, load the application's environment files for `db migrate`, `env check` and `env list`, with process values taking precedence, through one helper; verify `npm run db:migrate` with `DATABASE_URL` only in `.env`, and `env check` reporting it as set.
- [ ] 8.2 RK-06: show the configuration's own message when the Drizzle configuration throws, and distinguish a missing dependency from a thrown error (`migration-config.ts:24-31`); verify with a configuration that throws.
- [ ] 8.3 RK-31: report how many migrations were applied, or that the database is up to date (`commands/db.ts:64`, `migration.schemas.ts`); name the project's package manager in the "generate first" message (`migration-execute.ts:37`); state the environment and configuration inputs in `db migrate --help`; verify a first and a repeated run.

## 9. Database scaffold for Node

**Findings:** RK-05, RK-35. **Owns:** `packages/cli/src/scaffolding/render-database*.ts`, `packages/drizzle/src/**`, `packages/create-relkit/src/dependency-patches.ts`, `apps/docs/content/docs/modules/deployment/runtimes.mdx`, `tests/generator/**` for the database scaffold.

- [ ] 9.1 RK-05: add a runtime-selecting PostgreSQL and MySQL client to `@relkit/drizzle`, mirroring `openSqliteDatabase`, and render the database service with the runtime-selecting client for every dialect (`render-database-sources.ts:18-21`); replace the `bun --bun drizzle-kit generate` script; change the cli-scaffolding requirement that mandates the Bun-native SQLite driver with a MODIFIED delta; verify generated projects pass `check` on Node and on Bun for each dialect.
- [ ] 9.2 RK-35: write `patchedDependencies` only for package managers that apply it and tell the user when a declaration-only repair is skipped; write the install-script approval npm needs; verify the manifest created with npm, pnpm and Bun.

## 10. Check diagnostics, provider locations and doctor

**Findings:** RK-14, RK-15, RK-17, RK-32. **Starts after group 8 is merged.** **Owns:** `packages/cli/src/commands/{check,check-support,check-dependencies,check-route-modules,check-result,doctor-*}.ts`, `packages/cli/src/commands/doctor-project.service.ts`, `packages/cli/src/compiler/discovery/evaluator-child-framing.ts`, `packages/cli/src/compiler/normalize-{provider-validation,pass-support}.ts`, `packages/relkit/src/diagnostics/codes/compiler.ts`, the graph entry of `packages/relkit/src/diagnostics/codes/cli.ts`.

- [ ] 10.1 RK-14: report a Bun-only import evaluated on Node with a new code at the import line, naming the runtime and the alternatives, from the import preflight (`check-dependencies.ts:34-79`); verify with a fixture importing `bun:sqlite` and one importing `drizzle-orm/bun-sql`.
- [ ] 10.2 RK-15: skip the type check when evaluation failed, and make `relkit graph` say that the last check failed when diagnostics hold errors (`check.ts:43-58`); verify one error for one failing import.
- [ ] 10.3 RK-32: point provider binding diagnostics at the binding's entry and name a valid replacement (`normalize-provider-validation.ts:88-108`, `normalize-pass-support.ts:121-136`); verify the line for a local-only bucket.
- [ ] 10.4 RK-17: add doctor checks for imports the current runtime cannot load, environment files the current runtime will not read, and manifest fields the package manager ignores; verify on a Node project with a Bun-only service.

## 11. Command line messages and help

**Findings:** RK-16, RK-30, RK-33, RK-34. **Owns:** `packages/cli/src/{main,main-support,main-effect,cli-effect-runtime,local,invocation-signals,cli-help-builders,cli-help-model,command-project}.ts`, `packages/cli/src/commands/start-built-workflow.ts`, the entries of `packages/relkit/src/diagnostics/codes/cli.ts` other than the graph entry.

- [ ] 11.1 RK-16: fail `relkit start` without a build with a new `RELKIT_*` code that names `relkit build`, and stop native error codes from being printed as RelKit codes (`start-built-workflow.ts:46-51`, `main-support.ts:161-162`); verify the message and exit status.
- [ ] 11.2 RK-30: on an interrupt or termination signal print one neutral line in human output and keep the exit status and the JSON output (`main.ts:63-73`); verify with `packages/cli/tests/invocation/signals.test.ts`.
- [ ] 11.3 RK-33: report an unknown command as unknown with the available commands (`cli-effect-runtime.ts:132-139`); verify the text and that suggestions still appear for near misses.
- [ ] 11.4 RK-34: give each command real examples, the `--runtime` default, the build prerequisite of `start`; add `--include-outputs` to `check --json` and omit generated file bodies without it only if no consumer in this repository reads them, otherwise leave the shape and record why; verify the help snapshots and the generated CLI reference.

## 12. Reload after a compile failure

**Findings:** RK-18. **Starts after group 4 is merged.** **Owns:** `packages/cli/src/supervisor/**` except `proxy-*.ts`, `packages/cli/src/commands/dev-{engine,activation,command}*.ts`.

- [ ] 12.1 RK-18: reproduce with a test that saves a syntax error and then a fix two seconds later; report the parse failure with file and line when the candidate fails instead of waiting for the health timeout; start the rebuild for the later change as soon as it arrives; verify the failure is reported and the fix is serving within the reload budget.
