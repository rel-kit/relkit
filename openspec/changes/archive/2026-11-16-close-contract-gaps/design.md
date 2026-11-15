# Design

## Context

The archived change `2026-11-15-fix-logistics-audit-findings` ends with 52 harness rows that differ from the harness's expectation; its `evidence/final-report.md` lists ten of them as contract rows. Seven gaps remain behind those ten rows. The lead of this work decided how each is treated (D1 to D5 and D9 below). D6 to D8 and D10 are decisions taken while implementing, each from a measurement on the application.

## Facts measured on the application (RelKit 0.9.1, Better Auth 1.7.7)

- **Better Auth's error bodies.** A Better Auth error is `application/json` with `message`, and in most cases `code` (`{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}`). A few carry `message` alone (`{"message":"ROLE_NOT_FOUND: superuser"}`). A validation failure adds `issues` (`path`, `message`, and `option` when the input may take several shapes); RelKit's adapter writes that body. Some answers have no body at all: `POST /api/auth/organization/create` without a session answers 401 with `content-type: application/json` and zero bytes. In the SDK's source, an error is thrown either with a body that has `message`, or with no body.
- **What the document says today.** Each Better Auth operation declares 400, 401, 403, 404, 429 and 500 with an inline schema that has only `message`. The 403 lists only `application/json`.
- **Answers RelKit sends on the auth mount.** A state-changing request from another origin is refused by the transport policy before Better Auth runs: 403 `application/problem+json`, code `origin-denied` or `csrf-denied`. A body over the limit is 413 Problem Details (already declared). An unknown path under the mount is Better Auth's empty 404.
- **Served operations.** The document lists 54 Better Auth operations. Sent once each, without a session, to the application on Node and on Bun, all 54 are routed (none answers the router's empty 404). One of them, `POST /api/auth/get-session`, answers 405 to every request: Better Auth accepts `POST` there only when `session.deferSessionRefresh` is on. No operation comes from a plugin that is not enabled: the SDK's generator reads the endpoints of the configured instance.
- **431.** A request with a 20 KB header is answered `HTTP/1.1 431 Request Header Fields Too Large`, `Connection: close`, no other header and no body, on Node and on Bun, behind `relkit dev` and from the runtime adapter that the built server of `relkit start` listens through. On Node the answer is written by `node:http` when the parser fails; the server offers the `clientError` event to replace it. On Bun the answer is written inside `Bun.serve`, which has no hook for it. The `relkit dev` front listens through the Node adapter on Node and through `Bun.serve` on Bun, so it gives the answer of the runtime it runs on. `relkit start` itself could not be run on the application: its release build refuses the local-only bucket binding (`RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED`), so the adapters were measured directly from the installed packages.
- **The live update stream.** `GET /_relkit/v1/client/contract-events` is answered by the development front itself, not by a worker, so the worker's request ID middleware never sees it.
- **`HEAD` and `OPTIONS`.** `HEAD` runs the `GET` route and drops the body; `OPTIONS` without `Access-Control-Request-Method` answers 204 with `Allow`. Both come from the route table, which leaves out mounts registered for every method, so they hold for the application's routes and not for paths under the auth mount: `HEAD /api/auth/ok` and `OPTIONS /api/auth/ok` get Better Auth's 404.

## Decisions

### D1: Better Auth's errors keep their format; the document declares it (gaps 3 and 4)

Converting them to Problem Details would break every client built on Better Auth's own SDK, which reads `message` and `code`. The projection in `@relkit/better-auth` adds a `BetterAuthError` component (`message` required, `code` and `issues` optional, a description saying that some answers have no body) and points every 4xx and 5xx JSON response at it when the response still has the SDK's generic `message`-only schema. A response the SDK describes in another way is left alone, as the other corrections in that file are.

### D2: The 403 of a state-changing auth operation lists both media types

`POST`, `PUT`, `PATCH` and `DELETE` operations declare `application/problem+json` (the existing `BetterAuthProblem` component) beside `application/json` for 403. This is the row the audit saw on `organization/set-active`. Safe methods are not checked by the transport policy and keep the single media type.

### D3: Only served authentication operations are listed (gap 5)

Listing a served endpoint is correct whether an application uses it or not, so the 53 that answer stay. `POST get-session` is removed from the document unless `session.deferSessionRefresh` is on: an operation that answers 405 to every request is not served. The projection receives that one setting from the activated instance. A contract test sends every documented operation to a real instance and fails if the router does not match one, so an SDK upgrade that documents an endpoint it does not serve is caught here and not by an application.

### D4: `x-request-id` where RelKit writes the answer (gap 6)

- The development front adds `x-request-id` to the live update stream, in the same `request-<uuid>` form as its other answers.
- On Node, the runtime adapter handles `clientError`. For a header overflow it writes the same 431 with `x-request-id`; for every other parser failure it writes the bytes `node:http` would have written. This covers `relkit start` and the `relkit dev` front on Node, which both listen through the adapter.
- On Bun nothing changes. The runtime answers before any RelKit code runs, so there is no place to add the header, and the documentation says that this answer has no request ID on Bun.

No request record exists for a 431: the request was refused before it was read. The documentation says the ID names the answer only.

### D5: `HEAD`, `OPTIONS` and 431 are described once, not per operation (gaps 1 and 2)

Operations for `HEAD` and `OPTIONS` on every route would double the document and add two methods to every generated client; 431 is answered before a route is known. The generator writes one paragraph into `info.description`, and the HTTP pages say the same. The paragraph is in the generated file as well as in the served document, because it is true of both.

### D6: The auth section of the description says which format applies

The served document already appends an Authentication section to the description. It gains two sentences: these operations answer errors in Better Auth's format, and `HEAD` and `OPTIONS` on these paths are answered by Better Auth, not by the rules above.

### D7: Other parser refusals on Node stay as they are

The `clientError` handler must answer every parser failure once it is registered. Malformed requests (400), request timeouts (408) and oversized chunk extensions (413) keep the bytes `node:http` writes by default, without a request ID. Giving them an ID on Node alone would add a second difference between the runtimes for answers the audit did not question. They are documented with 431 as server-level answers.

### D8: No Problem Details body on the 431

RelKit could write one on Node and cannot on Bun. A client could not rely on it, so the answer keeps an empty body on both and differs only by the header.

### D9: The request ID and the trace ID stay different (gap 7)

Documented in "Find a request" on the HTTP responses page. Nothing to do.

### D10: `GENERATOR_VERSION` is not raised

The version marks a change a consumer of the generated contract must react to. A description does not change any operation, schema or client.

## Risks

- **Node's default answers change in a later Node release.** The handler writes fixed bytes for 400, 408 and 413. A test compares the 400 with what a server without the handler writes on the running Node version.
- **A later SDK accepts `POST get-session` without the setting.** The operation would then be missing from the document although it is served. The contract test in D3 covers the other direction only; the removal is one function with its own test and can be dropped in one edit.
- **The harness expects one error envelope and operations for `HEAD` and `OPTIONS`.** Five rows stay as they are by decision. The report proposes the changes to the harness; its expectations are not edited here.

## Non-goals

- Converting Better Auth's errors, or wrapping its handler.
- Request IDs on the bare 400 a malformed `Host` gets, or on Node's 400 and 408.
- Raising or configuring the header size limit.
