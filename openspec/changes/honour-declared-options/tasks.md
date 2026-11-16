# Tasks

> A box is checked only after the verification named in its task has run and passed. For every defect: write the test that reproduces it and see it fail, then fix, then see it pass. Keep files at or under 250 lines and add one changeset per package touched.

## 1. Event function profile

- [x] 1.1 Add compiler tests: an event function without `profile` in an application with `defaults.event`, and with one named profile, compiles without a diagnostic and its trigger has that profile; verify they fail before the fix.
- [x] 1.2 Add a client test: a publisher's client without a profile publishes to the only profile of its source; verify it fails before the fix.
- [x] 1.3 Keep the omitted profile omitted at definition and resolve the client's profile from its source; verify the compiler, event and integration suites.

## 2. Test application context

- [x] 2.1 Add a test that `createTestApplication` passes `context` to handlers as `createTestRuntime` does; verify it fails before the fix.
- [x] 2.2 Honour the option; verify the testing package's suites.

## 3. Sensitive event fields

- [x] 3.1 List every place an event payload is recorded or shown, with the test for each, in the evidence.
- [x] 3.2 Add tests that a sensitive field appears unredacted at each place; verify they fail before the fix.
- [x] 3.3 Redact at the recording and projection boundary with the existing marker and path rules; verify the tests pass and that a handler, a reaction and a replay receive the real payload.

## 4. Task limits

- [ ] 4.1 Write the table of what each backend does with `maxDuration`, `maxElapsed` and `logging` in the evidence.
- [ ] 4.2 Add tests that the local backend does not enforce `maxDuration` and `maxElapsed`; verify they fail before the fix, then enforce them.
- [ ] 4.3 Add tests for the diagnostic of a backend that cannot honour an option, at check and at start; verify they fail before the fix, then add the diagnostic.
- [ ] 4.4 Decide `logging` from its documented meaning: implement it, or propose and stop.

## 5. Proof and archive

- [ ] 5.1 Add the changesets and regenerate the documentation; verify `bun run changeset status` and `generate:check`.
- [ ] 5.2 Prove on a plain copy of the logistics application: the event function without `profile`, the redacted field in the log, the trace and the Inspector records, and the request harness on Node and on Bun without a regression.
- [ ] 5.3 Run `bun run prepush`, `bun run test:types`, `bun run test:packages`, `bun run test:inspector` and `openspec validate --specs`; verify each passes, then archive the change.
