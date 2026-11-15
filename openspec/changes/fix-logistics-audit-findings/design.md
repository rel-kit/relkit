# Design

## Context

The audited application is an outside project on the published 0.9.0 packages. `main` is 0.9.0 plus three release-tooling commits, so a baseline taken on the published packages is a baseline of `main`.

## Goals / Non-Goals

**Goals**

- A repeatable audit: the same request matrix, command list and Inspector checklist run before and after the fixes, under npm and under Bun.
- Every RelKit and Inspector failure traced to a cause in source, fixed behind a failing-first regression test, and closed only when the audit case that found it passes.

**Non-Goals**

- New features the application did not need.
- Breaking changes to public API.
- Publishing a release; the candidates are packed and installed locally.

## Decisions

### D1. Two clean environments instead of the developer's checkout

The audit runs in two fresh worktrees of the application, one installed with `npm ci` and one with `bun install`, each with its own database and port. A clean install shows what a new user gets (for example, whether a Bun-only patch is silently skipped by npm); the developer's checkout and database stay untouched.

### D2. The harness is plain `fetch` and owned by the application

The request matrix lives in the application repository and uses only `fetch`, so it runs on Node and on Bun and does not depend on the code under test. Every request is written as one JSON line with status, headers, body, duration and request id, which is what the Inspector pages are checked against.

### D3. Findings are classified before they become tasks

Each failure is one of: RelKit defect (`RK`), Inspector defect (`IN`: wrong, missing or ambiguous), application defect (`APP`), documentation gap (`DOC`), or by design. Only `RK` and `IN` change RelKit behaviour. A by-design failure gets a clear diagnostic and documentation, not a behaviour change.

### D4. Candidates are verified as packed archives

The fixed packages keep version 0.9.0, so the re-audit installs archives packed from this branch through the repository's fixture registry with isolated package-manager caches. A cache or lockfile could otherwise serve the published copy and make the re-audit meaningless.

### D5. Task groups follow file ownership

Fix groups are cut so that no two groups edit the same files; each group is implemented in its own worktree and merged by the lead after its regression tests are re-run.

### D6. Oversize bodies answer 413 everywhere

Today an oversize body is 413 when `Content-Length` is declared and 422 when it is streamed, and always 422 in development because the proxy drops the header. One status is required; 413 with the code `payload-too-large` is what production already sends in the common case, what the documentation states, and what HTTP defines, so that answer is kept byte for byte and the streamed path joins it. `body-too-large` remains the name of the validation issue inside request mapping. Malformed JSON and a wrong content type stay 422 as specified. Alternative rejected: 422 for all three, which would change the common production answer.

### D7. Dotenv precedence under `relkit dev` is unchanged

Values in environment files override exported shell variables during development; this is documented and tests depend on it. Only the Node gap is closed: one-shot commands read the files, with process values taking precedence, as the documentation already says for Bun.

### D8. The graph probe on the application port carries identity only

Activation needs hashes and versions. Everything else moves behind the authenticated bridge, which already serves it. This changes the body of an internal endpoint; its consumers in this repository are updated in the same task.

### D9. `relkit start` defaults to production

This changes behaviour for anyone who relied on a started build being in development mode. It is the safe default and matches the container, Vercel and Workers targets; setting `RELKIT_ENV` keeps the old behaviour.

### D10. Failure detail leaves the response, not the developer

The cause is removed from 500 bodies in every mode and recorded, redacted, in the error log and on the request's span, where the Inspector can show it. The test that asserted the cause in the development response is changed with the behaviour.

### D11. Acting as a user from the Inspector is out of scope

Invoke, channel connect and "send request" run without a session. This change makes them say so and show the application's real answer. Choosing an identity is a new capability and is recorded as a follow-up.

### D12. Three Inspector findings are deferred as new capabilities

Recording HTTP headers and bodies (IN-04, beyond the invocation's captured input and result), the caller on each request record (IN-30), and choosing a user for Inspector actions (IN-02, IN-08, IN-26, beyond saying why they were refused) each add data collection with redaction and privacy rules of their own. They are recorded as follow-ups; this change makes the interface truthful about their absence. Control-plane requests are not recorded by design (IN-44).

### D13. `relkit check --json` lists generated files without their text

The JSON printed by `relkit check --json` embedded the text of every generated file (one line of about 420 KB for the audited application). Nothing in this repository reads that text from the CLI's output, so the default now lists each file's path, hash and size, and `--include-outputs` adds the text. A script outside this repository that read the text must add the flag; the changeset says so. The in-process result of `checkProject()` is unchanged.

### D14. An unknown command exits with the usage status

`relkit <unknown>` now fails with `RELKIT_UNKNOWN_COMMAND` and exit status 2, like other usage errors, instead of `RELKIT_COMMAND_UNAVAILABLE` and status 1. `RELKIT_COMMAND_UNAVAILABLE` keeps its meaning for a command that parses but is not implemented.

### D15. The framework's success logs stay out of the inspection stream

Measured on a generated API: before this change a request left 15 to 74 records in the development inspection buffer, of which 11 to 58 were span revisions (every attribute and event re-sends the whole span) and 1 to 9 were `Execution operation completed` success logs; at about 30 sequential requests per second the buffer gave up 31,000 to 42,000 records in 1,260 requests, and 1 request in 4 (Bun) to 8 (Node) lost its record or its end. The application now sends one revision per finished span, and its framework success logs are not sent to the Inspector: the span of the same operation already carries its outcome and duration. Failure and interruption logs, the request line and the application's own logs are sent as before; the local store, exporters and JSON sink still receive success logs, and production is unchanged. `remote.frameworkSuccessLogs: true` sends them again (no command-line switch yet). Alternatives rejected: sampling them, which shows the steps of some requests and not others; and turning `ExecutionSuccessLogs` off for request scopes, which would also empty the JSON and exporter streams that consumers rely on.

## Risks / Trade-offs

- The application's database layer is Bun-only, so some Node failures belong to the application. Triage separates them; the Node path of RelKit is still exercised up to the point where application code fails.
- The Inspector checklist includes judgement ("ambiguous"). Each such finding states what a reader would wrongly conclude, so it can be verified after the fix.

## Migration Plan

None expected. Any change in observable behaviour is listed in a changeset for the package that owns it.
