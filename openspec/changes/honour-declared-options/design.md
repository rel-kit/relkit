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
