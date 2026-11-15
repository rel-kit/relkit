# Tasks

> A box is checked only after the verification named in its task has run and passed. For every code task: write the test first and see it fail; keep files at or under 250 lines; keep `node:` and `Bun.*` inside the runtime adapters; add one changeset per package whose behaviour changes.

## 1. Facts

- [x] 1.1 Send failing requests to at least three Better Auth endpoints of the application and record the status, content type and body; verify the shapes listed in `design.md` against the answers.
- [x] 1.2 Send every Better Auth operation of the served document once to the application on Node and on Bun; verify how many are routed and record any that answers 404 or 405 to every request.
- [x] 1.3 Send a request with a 20 KB header to the application behind `relkit dev`, and to the runtime adapter the built server of `relkit start` listens through, on Node and on Bun; verify which bytes come back and which code writes them.
- [x] 1.4 Send `HEAD` and `OPTIONS` to an application route and to a path under the auth mount; verify which of them the route table answers.

## 2. Better Auth operations in the served document

- [ ] 2.1 Add a test on a document from a real instance: every 4xx and 5xx JSON response of an operation refers to `BetterAuthError`, the component requires `message` and allows `code` and `issues`, and a response the SDK describes differently is left alone; make the projection do it in a new `openapi-errors.ts`; verify with `bun run test:packages` for `@relkit/better-auth` (the test fails before, passes after).
- [ ] 2.2 Add a test: the 403 of `POST organization/set-active` lists `application/json` and `application/problem+json`, the 403 of `GET list-sessions` lists `application/json` only; implement; verify with the same suite.
- [ ] 2.3 Add a test: `POST get-session` is absent from the document of an instance without `session.deferSessionRefresh`, present with it, and `GET get-session` is present in both; implement; verify with the same suite.
- [ ] 2.4 Add a contract test that sends every documented operation to the instance's handler and fails when one answers the router's empty 404; verify it passes for an instance with and without the organization plugin, and that an instance without the plugin documents no organization operation.
- [ ] 2.5 Add a test on the merged document: the Authentication section of `info.description` names Better Auth's error format and says who answers `HEAD` and `OPTIONS` under the mount; implement in `api-docs-auth.ts`; verify with the `relkit` runtime-hono tests.
- [x] 2.6 Add the changesets for `@relkit/better-auth` and `relkit`; verify `bun run changeset status` lists both.

## 3. Request identity

- [ ] 3.1 Add a test: the response of the live update stream carries `x-request-id` in the form `request-<uuid>`, and two streams get different values; implement in `contract-publish.ts`; verify with the `@relkit/cli` supervisor tests.
- [ ] 3.2 Add a test that starts the Node adapter, sends a request with a header over the limit on a raw socket and expects 431 with `x-request-id` and `Connection: close`; add a second test that a malformed request line still gets the bytes of a plain `node:http` server; implement the `clientError` handler in the Node adapter; verify with the `relkit` runtime tests on Node.
- [x] 3.3 Add the changesets for `@relkit/cli` and `relkit`; verify `bun run changeset status` lists them.

## 4. `HEAD`, `OPTIONS` and 431 in the document

- [ ] 4.1 Add a test: the generated document's `info.description` says that a `GET` route also answers `HEAD`, that `OPTIONS` answers 204 with `Allow`, and that 431 is sent before a route is chosen; no `head` or `options` operation is generated for a `GET` route; implement in the generator; verify with the `relkit` OpenAPI tests.
- [ ] 4.2 Add a test that the served document keeps that paragraph when the Authentication section is appended; verify with the runtime-hono tests.
- [x] 4.3 Regenerate the tracked output of `examples/commerce`, `examples/auth-drizzle` and `examples/data-model` with `bun run check` in each; verify a second run leaves `git status` unchanged.

## 5. Documentation

- [x] 5.1 HTTP responses page: state that routes under the auth mount answer in Better Auth's format, add 431 and the other server-level answers to what the framework sends, and name the answers without `x-request-id` in "Find a request"; verify `bun run --cwd apps/docs generate:check` and `bun scripts/user-text.ts`.
- [x] 5.2 OpenAPI page: say what the description states about `HEAD`, `OPTIONS` and 431, and that Better Auth operations declare `BetterAuthError`; verify with the same two commands.
- [x] 5.3 Better Auth page: describe the error format and the two media types of 403, and remove the difference that no longer remains; verify with the same two commands.
- [x] 5.4 Run `bun run --cwd apps/docs generate`; verify `generate:check` passes and the diff holds only the pages this change touches.

## 6. Proof on the application

- [x] 6.1 Build and pack the packages, serve them from a local registry and install them into a new worktree of the application with an empty cache; verify `verify-candidates.py` reports 0 differing files for the npm install and for the Bun install.
- [x] 6.2 Run the whole harness on Node and compare with the audit's last Node run; verify no row that passed fails, no answer is 5xx, and each contract row is fixed or unchanged by decision.
- [x] 6.3 Run the whole harness on Bun and compare with the audit's last Bun run; verify the same.
- [x] 6.4 Record the request and the answer for each fixed behaviour: `BetterAuthError` against a real error on three endpoints, `x-request-id` on the stream, the 431 on Node, on Bun and through the front, the description's paragraph, and the count of Better Auth operations before and after; verify each against the running application.
- [x] 6.5 Write `evidence/report.md` with the facts, the comparison and the proposed changes to the harness; verify it holds no machine path and no secret.

## 7. Repository checks and archive

- [ ] 7.1 Run `bun run prepush`; verify it passes.
- [ ] 7.2 Run `bun run test:packages` to its end; verify every set of tests passes, the last Bun ones included.
- [ ] 7.3 Run `bun run test:inspector`; verify it passes.
- [ ] 7.4 Run `openspec validate --specs`; verify it passes, then archive the change with `openspec archive close-contract-gaps -y`.
- [ ] 7.5 Stop every server and registry started for the proof, drop the throwaway database and remove the application worktree; verify none is left.
