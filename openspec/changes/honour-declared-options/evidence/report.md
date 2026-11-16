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
