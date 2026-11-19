# Design

## Context

Four defects were found while describing every authoring option (`openspec/changes/archive/2026-11-16-finish-authoring-editor-proposals/evidence/report.md`, "Found while writing them"). The lead decided how each is fixed. Each was first reproduced by a test that failed; a defect that does not reproduce is not changed.

## Decisions

### D1: An omitted event function profile stays omitted

`defineEventFunction` wrote `profile: "default"` when the option was absent. The compiler then looked for a profile named `default`, did not find it in an application with only named profiles, and reported `Unqualified event use requires a default when multiple profiles exist`, although the function named nothing. The definition now leaves the field out; the compiler's existing selection applies `defaults.event` or the only profile, as for `defineEvent`.

- The descriptor's `profile` is optional in its type, as it is on an event descriptor. Code that read it as always present has to handle `undefined`.
- `eventProfile()` and `eventProfileEffect()` are public and keep returning `"default"` for `undefined`; the definition no longer calls them for an omitted profile.
- A publisher's client (`createEventClient`) without a profile uses the only profile of its source; with a single provider as source the name stays `default`, which is only a label there.
- The compiler's diagnostic for a profile that was named and does not exist now names it (`Provider profile "x" does not provide event.`) instead of calling the use unqualified.

The one case whose behaviour changes: an application with an event profile named `default` beside others and `defaults.event` set to another one. An event function without `profile` used `default` and now uses `defaults.event`.

### D2: `context` of `createTestApplication` is applied last

The application built its own context object and wrote the fields of its services into it (`database`, and an `auth` that reads the current request's session), so the option never reached a handler. The option's fields are now written into the same object after the services' fields. That is the meaning the option has in `createTestRuntime`: a field the test passes replaces the default. A test can therefore replace `auth` for every call, or add a field of its own, and a field it does not pass keeps the application's value.

### D3: Sensitive fields are replaced where the payload is captured

The payload of an event is recorded in two places: the span of the publication, which captures the payload as its input and the publish result (which carries the payload) as its output, and the span of each event function, which captures the function's input. Everything else that shows a payload reads those span records: the local store, the Inspector's trace and capture views, and the Sentry exporter. Logs, failure records and the Inspector's publication and delivery records do not contain the payload (see the evidence), so nothing changes there.

- **Event function.** `bindFunctionEvents`, which the generated server and the test runtime both use to give an event function its event's schema, also gives the bound target the event's `sensitiveFields`. The engine replaces those fields in the value it captures as the invocation's input. The handler is called with the input itself. A replay is the same invocation with another source, so it is covered.
- **Publication.** The event client takes `recordedPayload`, a function that gives the form of the payload a span records. The engine passes one built from the declared event's `sensitiveFields`; the Inspector's publish action does the same. The span's input is that form, and the value the span captures as output is the result with that form as its payload. The provider and the caller get the real payload and the real result.
- **Rules.** `redactNamedFields` applies the existing policy's marker and key rules to a value: a name matches a key anywhere, after lowercasing and removing spaces, `_` and `-`; a dotted path matches from the root of the value; an array index is a path segment. `sensitiveFields` was documented as "names of payload fields" and validated only as non-empty unique strings, so both a name and a path were already accepted; the meaning of a path is now the policy's.
- **Stores.** The durable store keeps the payload, because delivery and replay read it. The local provider's admin query can return a stored payload for one publication; only the Inspector's replay fallback calls it, on the server, and the events route does not forward the publication ID, so no payload reaches the Inspector that way.
- Capture is off unless `telemetry.redaction.mode` is `development-redacted`. With it off nothing records a payload and there is nothing to redact.

### D4: A task limit is enforced by the local backend and reported for the others

**Enforcement on the local backend.** The engine already fails an invocation at the deadline its binding carries (`run.deadlineMs`), with the failure kind `timeout` and the code `RELKIT_TIMEOUT`; no jobs adapter set the field. The local backend now sets it for every attempt it starts.

- `maxElapsed` is a deadline fixed when the run is accepted: `acceptedAt + maxElapsed`.
- `maxDuration` is the active time of one attempt. The backend keeps the time the attempt has worked before its sleeps (`activeMs`, written to the journal with the run) and gives each start of the attempt the rest: `now + maxDuration - activeMs`. A sleep adds the time worked to `activeMs`; a retry starts a new attempt and clears it. Time asleep and time waiting to retry do not count.
- The deadline of an attempt is the earlier of the two.
- An attempt stopped by `maxDuration` is a failed attempt: the task's `retry` decides whether another one runs. A run past `maxElapsed` is not retried, whatever failed.
- A run asleep or waiting when `maxElapsed` passes is claimed at the next poll with a deadline that has passed. The engine fails it before its handler runs, so the run ends at the limit instead of when it would have woken.
- A run stopped by a limit ends with the status `timed-out` (the status already existed and the local backend never set it) and the error `RELKIT_TIMEOUT` with a message that names the task, the limit and its value.
- The clock of an attempt starts when the backend claims it, so the journal write of the claim (a few milliseconds) counts. Limits are declared in seconds or more in practice.
- The handler is not killed. The engine aborts the attempt's `signal` and settles the attempt; a handler that ignores the signal keeps running in the process until it returns, and its result is discarded. This is how a function's `timeoutMs` already behaves.

**Report for the other backends.** A backend declares the limits it enforces as features of its adapter: `task-max-duration` and `task-max-elapsed`. The local adapter declares both. `relkit check` reads the compiled graph and, for each job, compares the limits of its task with the features of the provider of its profile. Each limit without its feature is one warning, `RELKIT_JOB_TASK_OPTION_UNSUPPORTED`, at the task's source location, with a message that names the task, the option, the backend and the profile. The generated server carries the same list, computed from the same graph by the same function, and writes one warning log per entry when its jobs workers have started. An embedded handle (`createRelkit`) starts no workers and logs nothing.

- **Warning, not error.** The constraint is that an application that checks and starts today still does. Every application with `maxDuration` on Inngest, Trigger.dev, Effect MQ or Postgres would stop checking if this were an error. Alternative recorded: make it an error in a later minor version, once the Postgres backend enforces the limits (it has leases and a clock and is the backend production applications are told to use).
- **A passing check prints its warnings.** `relkit check` printed only `Checked <root>` when the check passed, so no warning of a passing check was visible outside `--json`. It now prints the warnings above that line. This also shows the warnings that already existed (a deprecation, a convention, an unused declared error). The exit code does not change.
- **Unknown adapters.** An adapter that declares neither feature is reported. That is the intent: a limit is enforced or reported.
- **Inngest.** Its policy mapping refused a submission whose task had `maxElapsed` (`Inngest cannot certify task policy field "maxElapsed".`). It no longer refuses: the option is reported at check and at start like on the other backends, and the run is accepted. Inngest has a mapping of `maxDuration` to `timeouts.finish`, but the generated server registers Inngest functions without the task's policy, so the mapping is never reached; Inngest therefore does not declare `task-max-duration`. Passing the policy would also change retries and concurrency on Inngest and needs a run against an Inngest server, so it is proposed, not done.

**`logging` has no defined meaning and is not changed.** No specification says what `level` filters or what a path in `redact` selects, and no code reads the option. Nothing is implemented and no report is added for it. Proposal, for a decision: define it in the engine, not per backend (`level` is the lowest level of `context.log` entries kept for the task's runs; `redact` lists paths replaced with `[REDACTED]` in the captured input and output of the task's runs, with the rules `sensitiveFields` of an event now has), or deprecate the option. Until then the only code that names it is Inngest's policy mapping, which still refuses a task that sets it; the message now names the backend and the option (`The inngest jobs backend does not support the task option "logging". Remove it from the task.`).
