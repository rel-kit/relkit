# Fix the failures a real application finds in RelKit 0.9.0

## Why

A logistics backend built on the published 0.9.0 packages (25 routes, Better Auth companies and roles, a realtime channel, an event with a durable reaction, a private bucket with signed URLs) is the first application of this size that uses RelKit as an outside project would: installed from the registry, with npm and with Bun. Its README and tests already carry workarounds for RelKit behaviour, and the Inspector has never been checked page by page against the traffic of such an application. The repository's own suites run against fixtures and small examples, so they do not show what this application meets.

## What Changes

- Exercise every route, system endpoint, command and Inspector page of the application under an npm install and under a Bun install, and record each failure with its cause.
- Fix every failure that RelKit owns, each behind a regression test that fails first.
- Fix every Inspector page that shows wrong data, lacks what the page promises, or leaves the reader unsure what they are looking at.
- Repeat the same audit against packages packed from this branch and require that no RelKit failure remains.

The baseline found 35 RelKit failures and 48 Inspector failures (`evidence/baseline-report.md`). In summary:

- **HTTP runtime:** early rejections no longer break the next request on the connection; `relkit start` runs in production mode; the graph probe on the application port carries identity only; 500 bodies carry no internal detail; the body limit holds for every route; JSON bodies are decoded strictly; `HEAD`, `OPTIONS`, request IDs, error shapes and default headers are made consistent.
- **Node path:** environment files are read by one-shot commands; the database scaffold runs on Node; the Inspector starts from Node, Bun and Bun with `node` aliased; runtime-only imports get a diagnostic at the import.
- **Development loop:** a compile failure is reported as such and does not delay the next reload; the worker listens on loopback; stopping is not an error.
- **Command line:** missing prerequisites, unknown commands, repeated migrations and provider bindings get precise messages; `doctor` reports runtime blockers.
- **Storage and realtime:** signed uploads carry the bucket's limits; precondition failures keep their status; client subscriptions end on abort.
- **Inspector:** pages show what happened (order, totals, causes, error codes, validation issues, channel contracts, outage state) and say plainly when an action cannot run.
- **BREAKING (defaults):** `relkit start` defaults to production mode; the core graph probe body shrinks; oversize bodies answer 413 in every path; 500 bodies carry no cause in development; access rules with roles or permissions answer before input validation; `relkit check --json` lists generated files without their text unless `--include-outputs` is given; an unknown command exits with status 2.

## Capabilities

### Modified Capabilities

`http-runtime`, `access-control`, `runtime-portability`, `development-loop`, `cli-scaffolding`, `managed-resources`, `package-distribution`, `acceptance-verification`, `development-inspector`, `observability`.

## Impact

- Packages: decided by triage; expected `relkit`, `@relkit/cli`, `@relkit/inspector`, the Inspector UI, `@relkit/testing`, and the documentation.
- No breaking change to public API types. The defaults listed above change; each is recorded in `design.md` and in a changeset.
- Evidence: `evidence/baseline-report.md` and `evidence/final-report.md` in this change, without machine paths.
