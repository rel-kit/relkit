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
