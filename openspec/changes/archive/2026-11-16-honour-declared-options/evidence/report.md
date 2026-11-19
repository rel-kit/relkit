# Evidence: four options that were accepted and ignored

## 1. Event function without `profile`

Reproduced. `tests/compiler/event-functions.test.ts`: an application with only named event profiles (`local` and `audit` with `defaults.event: "local"`, and `local` alone) and an event function without `profile` gave `RELKIT_PROVIDER_PROFILE_UNKNOWN`: `Unqualified event use requires a default when multiple profiles exist.` Both tests failed first and pass now; the trigger's profile is `local`.

The publisher's side reproduced too. `packages/relkit/tests/events/client-provider.test.ts`: a client without a profile whose source is `{ local: provider }` failed with `Event profile "default" is not configured`. It now publishes to `local`; with two profiles and none named it still fails, because a client cannot know the application's default.

Other places with the fallback `?? "default"` were read and left: the engine, the local delivery, the deployment plan and the Inspector topology read a trigger or node that the compiler has already resolved, so the fallback there only applies to an application with no event provider. `packages/testing/src/events.ts` falls back to the test event's own profile once the function's is absent, which is what a test expects.

## 2. `context` of `createTestApplication`

Reproduced. `packages/testing/tests/application/context-option.test.ts`: a handler invoked through the application read `tenant` as `undefined` and the session as `null` although the test passed both in `context`; the same handler invoked through `createTestRuntime` read them. Failed first, passes now. A field the test does not pass (`database`) keeps the value the application's services supply.

## 3. Where an event payload is recorded or shown

Traced from `context.events.<name>.publish(payload)` through delivery, replay and failure.

| Place                                                        | Is the payload written there?                                    | Where                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Publisher's span, input                                      | Yes, when capture is on                                          | `events/client-publish.ts` passes the payload as the span's `input`; field `inputCapture.content` |
| Publisher's span, output                                     | Yes, when capture is on                                          | the publish result carries `payload`; field `outputCapture.content.payload`                       |
| Event function's span, input                                 | Yes, when capture is on; delivery and replay                     | `engine/invoke-now.ts` captures the input of every function call; field `inputCapture.content`    |
| Local observability store, Inspector trace and capture views | Yes: they show the admitted span records above                   | `observability/**`, `apps/inspector/lib/trace-io.ts`, `function-capture.ts`                       |
| Sentry exporter                                              | Yes: it sends the admitted record, captures included             | `integrations/packages/sentry/src/runtime/exporter.ts`                                            |
| OTLP exporter                                                | No: attributes, events and links only                            | `integrations/packages/otlp/src/runtime/exporter-support.ts`                                      |
| RelKit's own log lines                                       | No: operation, outcome, duration and a cause summary only        | `contracts/operation-observer.ts`                                                                 |
| Failure records of a delivery                                | No: kind, code, message and declared error data only             | `providers-local/events/delivery-runner.ts`                                                       |
| Inspector events route (publications, deliveries)            | No: the projections do not pick the payload                      | `inspector-api/events-projection.ts`                                                              |
| Inspector publish and replay actions                         | No: the result has IDs and times only                            | `inspector-api/actions-dispatch-start.ts`                                                         |
| Local provider's stores                                      | Yes, and they must: replay reads them                            | `providers-local/events/provider.ts`, `log.ts`                                                    |
| Local provider's admin query with a publication ID           | Yes: the stored payload, used by the Inspector's replay fallback | `providers-local/events/admin-utils.ts`                                                           |

Capture is off unless `telemetry.redaction.mode` is `development-redacted`; with it off nothing above records the payload.

Reproduced. `tests/security/redaction/event-sensitive-fields.test.ts`, with `sensitiveFields: ["cardNumber", "customer.email"]`:

- The event function's span recorded `cardNumber: "4111-1111-1111-1111"` and `customer.email` in clear text. Failed first; it now records `[REDACTED]` for both, no record of any signal contains either value, and the handler received the real payload.
- The publication's span recorded both values in its input and under `payload` in its output. Failed first; both now carry the marker, and the publishing function read the real card number back from the publish result.

How each place is covered: the two spans by that test; the store, the Inspector's views and the Sentry exporter read the admitted span records, which the test reads from the collector; the Inspector's publish action passes the same option (`inspector-api/event-actions.ts`); replay is the event function's invocation with the source `event-replay`. Unit tests: `redactNamedFields` in `packages/relkit/tests/observability/redaction.test.ts`, the bound target in `packages/relkit/tests/events/event-binding.test.ts`.

How the existing policy matches a key: the marker is `[REDACTED]`; a key matches by its name anywhere in the value, or by its dotted path from the root of the captured value, after lowercasing and removing spaces, `_` and `-`; an array index is a path segment.

`sensitiveFields` today: an array of unique non-empty strings, trimmed; no syntax is checked and nothing is compared with the input schema. Its only description is the type comment.

## 4. Task limits per backend, before this change

What the options mean (type comments and the archived design `2026-09-21-add-task-first-jobs`, section 7.4): `maxDuration` is the active time of one attempt, without time asleep or waiting to retry; `maxElapsed` is the time from the acceptance of the run to its end, sleep, delays and retries included, and its deadline is fixed at acceptance. The design says an adapter that cannot enforce a limit must reject that field. `logging` (`level`, `redact`) has no defined behaviour: the design names it and shows one example, no specification says what `level` filters or what a `redact` path selects, and no code reads it. `modules/jobs/durations-and-sleep.mdx` says the durations "are enforced by the runtime", which was not true.

| Option        | local   | Inngest                                                                                                                                                                   | Trigger | effect-mq | Postgres |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | -------- |
| `maxDuration` | ignored | checked for whole seconds when a run is submitted; mapped to `timeouts.finish` only when the worker definition carries a policy, which the generated server does not pass | ignored | ignored   | ignored  |
| `maxElapsed`  | ignored | refused when a run is submitted: `Inngest cannot certify task policy field "maxElapsed".`                                                                                 | ignored | ignored   | ignored  |
| `logging`     | ignored | refused when a run is submitted: `Inngest cannot certify task policy field "logging".`                                                                                    | ignored | ignored   | ignored  |

No backend reported any of the three at `relkit check` or at start. Sources: `providers-local/jobs/native-adapter-work.ts` (reads `retry` only), `integrations/packages/inngest/src/runtime/policy.ts` and `runtime/index.ts`, `integrations/packages/trigger/src/runtime/task-binding.ts`, `integrations/packages/effect-mq/src/runtime/postgres-state.ts`, `integrations/packages/postgres/src/runtime/jobs-lease.ts`.

How the local backend runs an attempt: `createRun` stores `acceptedAt`; `nextRun` sets `startedAt` and a per-attempt abort controller; a sleep suspends the attempt (`suspendRun`) and the handler runs again from the start on wake; `failRun` schedules a retry or fails the run. The engine already fails an invocation whose binding carries `run.deadlineMs` with the failure kind `timeout` (`RELKIT_TIMEOUT`); no jobs adapter set that field.

## 5. Task limits after this change

### Reproduction on the local backend

`packages/relkit/tests/providers-local/native-job-limits.test.ts` defines a task with `defineTask`, a job with `defineJob`, builds a jobs runtime over the real local backend in a temporary directory, submits with `submitJob`, and runs worker passes the way the generated server does (`worker.next`, `executeTask`, then `complete`, `suspend` or `fail`). So the policy travels from the definition to the backend as it does in an application.

Before the change, five of its six tests failed (first run, with the first, shorter timings):

| Test                                                                             | Before                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| An attempt that works longer than `maxDuration` is stopped and the run times out | the pass took 507 ms for a 40 ms limit; the handler ran to its end |
| An attempt stopped by `maxDuration` is retried while attempts remain             | status `completed`, attempt 1                                      |
| Time asleep does not count toward `maxDuration`, time worked before it does      | the run that worked 200 ms against 150 ms was `completed`          |
| A run past `maxElapsed` times out without another attempt                        | 5 attempts ran against a limit that leaves room for 2              |
| A run asleep past `maxElapsed` times out at the limit                            | the run was not claimed; it stayed `sleeping`                      |
| A run without limits is not given a deadline                                     | passed (guard against a deadline on every run)                     |

After the change all six pass, eight runs in a row. The limits in the test are 200 ms and more: the clock of an attempt starts when the backend claims it, and the claim is written to the journal first, which took up to tens of milliseconds on the loaded machine and made a 40 ms limit fail an attempt that did no work.

### Reproduction of the missing report

`packages/cli/tests/check-task-options.test.ts` copies the minimal fixture application, adds a task with both limits and a job, and runs the real check pipeline.

| Test                                                                        | Before                                                           | After                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Check warns for each limit the jobs backend does not enforce (Inngest)      | no diagnostic                                                    | 2 warnings, check passes                                                                        |
| The check command prints the warnings of a check that passes                | printed only `Checked <root>` (seen by disabling the new branch) | the warnings, then `Checked <root>`, exit code 0                                                |
| The generated server logs each unenforced limit as a warning when it starts | the source had no such list                                      | one `warn` log record per entry, with the code, task, option, backend and profile in its fields |
| Check does not warn on the local backend                                    | passes before and after                                          | it would fail if the local adapter lost a feature                                               |

The output of `relkit check` on that application, as printed:

```text
src/hello/tasks/export.task.ts:4:16 - warning RELKIT_JOB_TASK_OPTION_UNSUPPORTED: Task "hello.export" declares maxDuration, which the inngest jobs backend (profile "default") does not enforce.
  suggestion: Enforce the limit in the task's handler, or remove maxDuration. The local backend from `@relkit/local` enforces it.
  docs: https://relkit.dev/docs/errors/relkit-job-task-option-unsupported
src/hello/tasks/export.task.ts:4:16 - warning RELKIT_JOB_TASK_OPTION_UNSUPPORTED: Task "hello.export" declares maxElapsed, which the inngest jobs backend (profile "default") does not enforce.
  suggestion: Enforce the limit in the task's handler, or remove maxElapsed. The local backend from `@relkit/local` enforces it.
  docs: https://relkit.dev/docs/errors/relkit-job-task-option-unsupported
Checked <project root>
```

Inngest: `integrations/packages/inngest/policy-defaults.test.ts` and `inngest.test.ts` were changed first and failed with the old message (`Inngest cannot certify task policy field "maxElapsed".`); they pass after the mapping changed.

### What each backend does now

| Option        | local                                                                                           | Inngest                                                                                                   | Trigger.dev                                 | Effect MQ                                   | Postgres                                    |
| ------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `maxDuration` | enforced per attempt; `RELKIT_TIMEOUT`, retried by the task's `retry`, final status `timed-out` | not enforced; warning at check and at start. A submission still fails when the value is not whole seconds | not enforced; warning at check and at start | not enforced; warning at check and at start | not enforced; warning at check and at start |
| `maxElapsed`  | enforced from acceptance; no further attempt, status `timed-out`                                | not enforced; warning at check and at start; a submission is no longer refused                            | not enforced; warning at check and at start | not enforced; warning at check and at start | not enforced; warning at check and at start |
| `logging`     | no defined meaning; ignored, not reported (unchanged)                                           | a submission is refused, now with a message that names the backend and the option                         | ignored, not reported (unchanged)           | ignored, not reported (unchanged)           | ignored, not reported (unchanged)           |

The rows for Inngest, Trigger.dev, Effect MQ and Postgres rest on reading their code and on the feature lists of their adapters, not on a run against those services. The warning for each was produced by the check from the adapter's real feature list only for Inngest; the others use the same rule (no `task-max-duration` or `task-max-elapsed` feature in `integrations/packages/*/src`).

### Suites

- `packages/relkit/tests/providers-local`, `tests/jobs`, `tests/diagnostics` (Vitest): 85 files passed, 309 tests.
- `tests/compiler` (Bun): 163 passed. CLI tests near the change (check rules, check JSON, build warnings, build runtime, production artifacts, development logs): 27 passed. `integrations/packages/local` and `inngest`: 30 passed. Documentation error pages: 3 passed.
- `bun run lint`, `bun run check`, `konsistent validate`, `generate:check`: passed.
- `bun run test:integration` is not part of the required checks and has 10 failures that this change does not touch (an OpenAPI description, an upload status, a missing `defineAgent` export in the built LangChain package, a layout migration fixture).

## 6. Proof on the logistics application

A plain folder copy of the application (`git archive main | tar -x`, outside both repositories), its own `.env`, the database `relkit_honour_proof`, port 4130. The branch's packages were packed, served from a local registry and installed with an empty cache: with npm and again with Bun, 14,037 files of 11 packages compared with the packed ones, 0 differ. The application itself was not changed; the edits below are in the copy only.

### Event function without `profile`

`profile: "local"` removed from `drivers.release-unavailable-vehicle` (the application has one event profile, `local`, and `defaults.event: "local"`).

- `relkit check`: `Checked <copy>`, exit 0, on Node and on Bun. `tsc --noEmit`: exit 0.
- The compiled graph's trigger `relkit.event.drivers.release-unavailable-vehicle.trigger` has `profile: "local"`.
- The reaction ran 20 times in each harness run (its own log line `released driver from unavailable vehicle`), and the harness group `effects`, which checks that a driver is released when a vehicle leaves `active`, passed 72 of 72 on both runtimes.

### `sensitiveFields` on the status-change event

`sensitiveFields: ["vehicleId"]` added to `fleet.vehicle-status-changed`. The application has `telemetry.redaction.mode: "development-redacted"`. Read from the copy's Inspector (port 3240) for one `PUT /vehicles/<id>/status` that answered 200:

| Where                                                                  | What is recorded                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Span `relkit.event.fleet.vehicle-status-changed.publish`, input        | `{"at": …, "from": "maintenance", "organizationId": …, "to": "active", "vehicleId": "[REDACTED]"}`                                              |
| The same span, output                                                  | the publish result with `"payload": {…, "vehicleId": "[REDACTED]"}`                                                                             |
| Span `relkit.invoke.drivers.release-unavailable-vehicle`, input        | `{…, "vehicleId": "[REDACTED]"}`                                                                                                                |
| Inspector `GET /events` and `GET /events/fleet.vehicle-status-changed` | no payload; the event's schema and `"sensitiveFields": ["vehicleId"]`. None of the 16 vehicle ids of the run is in either answer                |
| Development log                                                        | RelKit prints no event payload. The id is in two kinds of lines: the request line (`PUT /vehicles/<id>/status`) and the reaction's own log call |
| The reaction                                                           | received the real id: its own line reads `{"released":0,"to":"maintenance","vehicleId":"e59682b4-…"}`                                           |

The same id is still recorded where it is not this event's payload: the request's path, the input and output of the function that publishes the event (`fleet.change-vehicle-status`), and the output of the realtime channel's trigger. `sensitiveFields` of an event covers the event's payload only; the telemetry redaction policy's `redactKeys` covers a key everywhere.

### Request harness

`scripts/audit/run.mjs` against the copy with both edits, a fresh database for each runtime.

|                                     | Audit, Node | Part A, Node | Now, Node | Audit, Bun | Part A, Bun | Now, Bun |
| ----------------------------------- | ----------- | ------------ | --------- | ---------- | ----------- | -------- |
| Rows                                | 1,243       | 1,242        | 1,242     | 1,243      | 1,242       | 1,242    |
| As expected                         | 1,191       | 1,192        | 1,192     | 1,191      | 1,191       | 1,191    |
| Passed in the earlier run, fail now |             |              | 0         |            |             | 0        |
| 5xx answers                         |             |              | 0         |            |             | 0        |

Row by row, the runs are identical to the Part A runs. Against the audit's runs the differences are the two of Part A: the row `contract:content-type | POST /api/auth/organization/set-active -> 403` no longer arises, and `contract:x-request-id-on-every-response` passes on Node.

### Task limit on the generated server

Not asked for; added because the application has no task. In the copy: a `jobs` profile on `localJob()`, a task `fleet.slow-report` with `maxDuration: "2 seconds"` and `retry.maxAttempts: 2` whose handler waits for the time its input gives, a job, and a function that starts the job. `relkit check` passed without a warning. The journal of the local backend after one run of 30 seconds and one of 200 ms:

| Run        | Journal                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30 seconds | running (attempt 1) at 13:14:05.547; queued (attempt 2); running at 13:14:08.649; `timed-out` at 13:14:10.657 with `{"code":"RELKIT_TIMEOUT","message":"Task \"fleet.slow-report\" exceeded maxDuration of 2 seconds"}` |
| 200 ms     | running at 13:14:07.564, `completed` at 13:14:07.785                                                                                                                                                                    |

So the limit declared with `defineTask` reaches the local backend through the generated server, and the worker moves on to the next run when an attempt is stopped.

Found on the way, not changed: a job started through the client RPC (`relkit jobs trigger`, `POST /_relkit/v1/rpc/jobs/<name>/trigger`) on the local backend was accepted with the scope `public:<application>` and stayed `queued`; the server's worker asks the backend for runs of the scope `default`. Started from a function, the same job ran. Not compared with the published version.

### Cleanup

Development servers, the Inspector and the registry stopped; the database dropped; the copy's bucket volume removed; the copy and both package caches deleted.

## 7. Final checks

On `d7bab0ee7`, each to its end:

- `bun run prepush`: exit 0. Its first run, one commit earlier, failed at the type check: the new limits test imported a type name that does not exist, which Vitest does not report. Fixed in `d7bab0ee7`; all five checks were then run again from the start.
- `bun run test:types`: exit 0 (246 editor assertions on TypeScript 5.9 and 7).
- `bun run test:packages`: exit 0 (Vitest 3,412 passed, 4 skipped; Bun 527 and 420 passed, 22 skipped, 0 failed).
- `bun run test:inspector`: exit 0 (501 passed).
- `openspec validate --specs`: 39 passed, 0 failed.
