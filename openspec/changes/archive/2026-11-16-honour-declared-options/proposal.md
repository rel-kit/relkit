# Honour the options that are accepted and ignored

## Why

Writing a description for every authoring option showed four options that RelKit accepts and then does not act on. An application that sets one believes it has behaviour it does not have: an event's sensitive fields are stored and shown as a label but nothing redacts them; an event function without a `profile` is given the name `default` instead of the application's default; a task's `maxDuration`, `maxElapsed` and `logging` are ignored by most backends and refused with an unclear error by one; and `context` of `createTestApplication` is overwritten.

## What Changes

- **An event function without `profile` uses the application's default.** The definition no longer writes `default` for an omitted profile. The compiler selects `defaults.event`, or the only event profile, as it does for an event. A publisher's client without a profile uses the only profile of its source.
- **`context` of `createTestApplication` is honoured,** with the meaning it has in `createTestRuntime`.
- **`sensitiveFields` of an event are redacted where the payload is recorded or shown:** logs, telemetry and its exporters, the Inspector's records and payload views, and error reports. Handlers, reactions and replay receive the real payload.
- **Task limits are enforced or reported.** The local backend enforces `maxDuration` and `maxElapsed`. A backend that cannot honour a task option says which backend and which option when the application is checked and when it starts.

No public API is removed. One behaviour changes for an existing application and is stated in the changeset: an event function without `profile` in an application that has an event profile named `default` beside others and `defaults.event` set to another profile now uses `defaults.event`.

## Capabilities

### Modified Capabilities

- `jobs-events`: profile of an event function; redaction of an event's sensitive fields.
- `task-runtime`: enforcement and reporting of task limits.
- `acceptance-verification`: `context` of the test application.

## Impact

- Packages: `relkit` (events, engine, observability, Inspector API, local providers, jobs), `@relkit/cli` (compiler diagnostics), `@relkit/testing`, and the jobs integrations whose policy mapping changes.
- Tests: reproduction tests written before each fix, in the suite that owns the code.
