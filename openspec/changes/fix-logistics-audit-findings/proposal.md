# Fix the failures a real application finds in RelKit 0.9.0

## Why

A logistics backend built on the published 0.9.0 packages (25 routes, Better Auth companies and roles, a realtime channel, an event with a durable reaction, a private bucket with signed URLs) is the first application of this size that uses RelKit as an outside project would: installed from the registry, with npm and with Bun. Its README and tests already carry workarounds for RelKit behaviour, and the Inspector has never been checked page by page against the traffic of such an application. The repository's own suites run against fixtures and small examples, so they do not show what this application meets.

## What Changes

- Exercise every route, system endpoint, command and Inspector page of the application under an npm install and under a Bun install, and record each failure with its cause.
- Fix every failure that RelKit owns, each behind a regression test that fails first.
- Fix every Inspector page that shows wrong data, lacks what the page promises, or leaves the reader unsure what they are looking at.
- Repeat the same audit against packages packed from this branch and require that no RelKit failure remains.

The detailed list of changes is added to this proposal once the baseline report exists (task group 2).

## Capabilities

### Modified Capabilities

To be named by the baseline report. Expected: `http-runtime`, `development-loop`, `runtime-portability`, `access-control`, `local-provider-services`, `package-distribution`, `development-inspector`, `observability`, `user-facing-text`, `developer-documentation`, `acceptance-verification`.

## Impact

- Packages: decided by triage; expected `relkit`, `@relkit/cli`, `@relkit/inspector`, the Inspector UI, `@relkit/testing`, and the documentation.
- No breaking change to public API. Where a failure can only be removed by one, the compatible fix is taken and the alternative recorded in `design.md`.
- Evidence: `evidence/baseline-report.md` and `evidence/final-report.md` in this change, without machine paths.
