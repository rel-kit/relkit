# Close the contract gaps the real-application audit left

## Why

The audit of RelKit 0.9.1 through the logistics application leaves 52 of 1,243 harness rows that do not answer as the harness expects. Ten of them are contract rows: they compare what the application serves with its served OpenAPI document and with the guarantees the documentation makes. A follow-up on the application reduced them to seven gaps, and all seven are in this repository: in the generated document, in the Better Auth part of it, and in two answers that carry no request ID. A client generated from the document, or a person reading the HTTP pages, is told something the server does not do, or is not told something it does.

## What Changes

- **Better Auth's error format is declared and documented.** The served document gives the Better Auth operations one `BetterAuthError` schema with the body those endpoints send (`message`, usually `code`, and `issues` on a validation failure), and lists Problem Details beside it for the 403 that RelKit's transport policy sends before Better Auth runs. The errors themselves are not converted. The documentation says that routes under the auth mount answer in Better Auth's format and everything else in Problem Details.
- **The document lists only authentication operations the application serves.** `POST get-session` is left out unless `session.deferSessionRefresh` is on, because the endpoint answers 405 to every such request. A test sends every documented operation to a real Better Auth instance and fails when one is not routed.
- **`x-request-id` is on the client contract's live update stream**, and on the 431 answer where RelKit's code sends it (Node). On Bun the runtime sends the 431 before RelKit sees the request; the documentation says so.
- **`HEAD`, `OPTIONS` and 431 are documented as answers every route gives**, in the document's description and on the HTTP pages, instead of being generated as operations or listed on every operation.
- The request ID and the trace ID stay two values; this is already documented and nothing changes.

No public API changes. The generated OpenAPI document gains `info.description`; the served document's Better Auth error responses refer to a component instead of repeating an inline schema.

## Capabilities

### Modified Capabilities

- `http-runtime`: request identity on the live update stream and on server-level answers; what the generated and served documents say about `HEAD`, `OPTIONS`, 431 and the Better Auth operations.
- `acceptance-verification`: a contract row that remains after a decision is accepted only when the documentation states the behaviour.

## Impact

- Packages: `relkit` (OpenAPI generator, Node runtime adapter, the auth part of the served document), `@relkit/better-auth` (projection of Better Auth's OpenAPI document), `@relkit/cli` (the development front's live update stream).
- Documentation: the HTTP responses and OpenAPI pages, the Better Auth page.
- Generated output tracked in the repository: the OpenAPI files of the three examples and the documentation's generated pages.
- Evidence: `evidence/report.md` in this change, without machine paths.
