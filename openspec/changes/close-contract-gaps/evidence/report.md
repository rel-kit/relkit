# Report: contract gaps closed and proved on the application

The application is the logistics backend of the audit (25 routes, Better Auth 1.7.7 with the organization plugin), on its branch for RelKit 0.9.1. The packages under test were packed from this change, served from a local registry and installed into a separate worktree of the application with an empty cache: once with npm, once with Bun. In both installs 13,953 files of 11 first-party packages were compared with the archives and 0 differ.

## Result by gap

| Gap                                                | Rows | Treatment                                                                                                                   | Result                                                                                  |
| -------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. `HEAD` and `OPTIONS` are not in the document    | 4    | Stated once in `info.description` and on the HTTP pages                                                                     | Rows unchanged by decision                                                              |
| 2. 431 is not listed                               | 1    | Stated in the same paragraph; documented as an answer of the HTTP server                                                    | Row unchanged by decision                                                               |
| 3. Better Auth's error shape is not declared       | 1    | `BetterAuthError` component on every 4xx and 5xx JSON response; the 403 of state-changing operations lists both media types | Row no longer arises                                                                    |
| 4. Two error formats                               | 1    | Kept; documented on the HTTP responses page, the Better Auth page and in the document's Authentication section              | Row unchanged by decision                                                               |
| 5. The document lists all 54 Better Auth endpoints | 1    | 53 are served and stay; `POST get-session` answers 405 to every request and is left out                                     | Row unchanged by decision; it now names 30 operations the harness does not call, was 31 |
| 6. Two answers without `x-request-id`              | 1    | Added to the live update stream; added to the 431 on Node; documented for Bun                                               | Row passes on Node; on Bun 1 answer is left, was 2                                      |
| 7. The request ID and the trace ID are different   | 1    | Nothing; already documented                                                                                                 | Row unchanged                                                                           |

## Facts

**Who answers 431.** A request with a 20 KB header gets `HTTP/1.1 431 Request Header Fields Too Large` with `Connection: close` and no body before any handler runs.

| Where                                                      | Who writes the answer                         | `x-request-id` before | after   |
| ---------------------------------------------------------- | --------------------------------------------- | --------------------- | ------- |
| `relkit dev` front on Node                                 | `node:http` parser; now RelKit's Node adapter | absent                | present |
| `relkit dev` front on Bun                                  | `Bun.serve`, inside the runtime               | absent                | absent  |
| Runtime adapter of the built server (`relkit start`), Node | `node:http` parser; now RelKit's Node adapter | absent                | present |
| Runtime adapter of the built server (`relkit start`), Bun  | `Bun.serve`, inside the runtime               | absent                | absent  |

`Bun.serve` has no hook for a request its parser refuses, so no RelKit code runs there. Node reports the refusal through `clientError`, which the Node adapter now handles: the 431 gets a request ID, and a malformed request line still gets the bytes a plain `node:http` server writes (`HTTP/1.1 400 Bad Request`, `Connection: close`).

**Better Auth operations.** The served document listed 54. Each was sent once without a session, on Node and on Bun:

- 54 are matched by Better Auth's router (none gets its empty 404).
- 53 can answer with something other than 405. They stay, called by the application or not.
- 1, `POST /api/auth/get-session`, answers 405 to every request (`POST method requires deferSessionRefresh to be enabled in session config`). It is left out unless `session.deferSessionRefresh` is on.
- 0 come from a plugin that is not enabled.

After the change the document lists 53, and all 53 are routed and none answers 405.

**Better Auth's error bodies.** `application/json` with `message` and in most cases `code`; `issues` on a validation failure; a few with `message` alone; some with no body. The harness validated 680 error bodies on Node and 678 on Bun against the declared schemas, with no row for a body that does not match.

## Harness

The whole harness ran on Node (`npm run dev`, harness under Node) and on Bun (`bun run dev`, harness under Bun), one server at a time, each against a fresh database, and was compared row by row with the audit's last run on the same runtime.

|                                      | Audit, Node | Now, Node | Audit, Bun | Now, Bun |
| ------------------------------------ | ----------- | --------- | ---------- | -------- |
| Rows                                 | 1,243       | 1,242     | 1,243      | 1,242    |
| As expected                          | 1,191       | 1,192     | 1,191      | 1,191    |
| Not as expected                      | 52          | 50        | 52         | 51       |
| Rows that passed before and fail now |             | 0         |            | 0        |
| Answers with a 5xx status            |             | 0         |            | 0        |
| Responses without `x-request-id`     | 2           | 0         | 2          | 1        |
| Operations in the served document    | 79          | 78        | 79         | 78       |

Differences against the audit's runs:

- `contract:content-type | POST /api/auth/organization/set-active -> 403` no longer arises on either runtime. The harness writes that row only when an observed content type is not declared.
- `contract:x-request-id-on-every-response` passes on Node. On Bun it still fails, with one response: the 431.
- No other row changed its result or its status.

Node and Bun differ in the same three statuses the audit's final report explains (two sign-in rows without `Origin`, one double-slash path), and in the request ID row above.

### Rows left by decision, and what states the behaviour

| Row                                                                                            | Stated in                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `method-undeclared` for `HEAD /hello`, `HEAD /vehicles`, `OPTIONS /hello`, `OPTIONS /vehicles` | `info.description` of the document; HTTP responses page, "`OPTIONS` and `HEAD` are automatic"; OpenAPI page |
| `status-undeclared \| GET /hello -> 431`                                                       | `info.description`; HTTP responses page, "Answers before a route is chosen"                                 |
| `error-envelope-consistency`                                                                   | HTTP responses page, "Read an error response"; Better Auth page, "Read an authentication error"             |
| `uncalled-better-auth-operations`                                                              | Better Auth page: an operation is listed when the configuration serves it                                   |
| `x-request-id-on-every-response` on Bun                                                        | HTTP responses page, "Answers before a route is chosen" and "Find a request"                                |
| `request-id-header-equals-body-traceId`                                                        | HTTP responses page, "Find a request"                                                                       |

### Proposed changes to the harness

The expectations were not edited. These are proposals for the application's `scripts/audit/groups-contract.mjs`:

1. `method-undeclared`: do not record `HEAD` on a path whose `GET` is declared, or `OPTIONS` with a 204, when the document's description states them.
2. `status-undeclared`: do not record 431; it is an answer of the HTTP server, not of an operation.
3. `error-envelope-consistency`: expect one envelope per owner. Group answers under the auth mount separately and expect `message`-based JSON there, Problem Details elsewhere, and empty bodies only for the answers of the HTTP server.
4. `uncalled-better-auth-operations`: record it as information, as `coverage-summary` is, or check instead that every listed operation is routed, which is what the repository's contract test now does.
5. `x-request-id-on-every-response`: accept a 431 without the header when the server runs on Bun.
6. `request-id-header-equals-body-traceId`: compare the header with `body.requestId`, which is the documented guarantee, instead of with `traceId`.

## Fixed behaviours, request and answer

Recorded against the application with the packed packages; the same on Node and on Bun unless a line says otherwise.

**Declared error schema against real errors.** Every response below is declared with `application/json` and `{"$ref":"#/components/schemas/BetterAuthError"}`, and each body validates against that schema.

```text
POST /api/auth/sign-in/email {"email":"nobody@example.com","password":"wrong-password-1"}
  -> 401 application/json {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
POST /api/auth/sign-up/email {"email":"not-an-email"}
  -> 400 application/json {"message":"[body.name] required, expected string; [body.email] Invalid email address, …","code":"VALIDATION_ERROR","issues":[…]}
GET /api/auth/list-sessions
  -> 401 application/json {"message":"Unauthorized","code":"UNAUTHORIZED"}
POST /api/auth/organization/set-active {"organizationId":"unknown"}
  -> 401 application/json {"message":"Unauthorized","code":"UNAUTHORIZED"}
POST /api/auth/organization/create {"name":"x","slug":"x"}
  -> 401 application/json, no body (the schema's description names this case)
POST /api/auth/organization/set-active   Origin: https://evil.example
  -> 403 application/problem+json {"type":"/errors/origin-denied","title":"Forbidden","status":403,"code":"origin-denied",…}
     declared 403 media types: application/json, application/problem+json; the body validates against the Problem schema
```

**`x-request-id` on the live update stream.**

```text
GET /_relkit/v1/client/contract-events -> 200 text/event-stream  x-request-id: request-c3b05848-6dca-4e29-8633-6ffc0af0aaf3
GET /_relkit/v1/client/contract-events -> 200 text/event-stream  x-request-id: request-136eb7f1-b35f-4410-aa70-103874f5353c
```

**431, `GET /hello` with a 20 KB header.**

```text
relkit dev front, Node:   HTTP/1.1 431 Request Header Fields Too Large\r\nx-request-id: request-eed5c78e-79ed-408a-b64e-8f57bc4e3a7e\r\nConnection: close\r\n\r\n
relkit dev front, Bun:    HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n
runtime adapter, Node:    HTTP/1.1 431 Request Header Fields Too Large\r\nx-request-id: request-31083e04-5e68-4779-b545-84a14c8867c3\r\nConnection: close\r\n\r\n
runtime adapter, Bun:     HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n
```

**The document's statement.** `info.description` of the served document:

```text
### Answers every route gives

Every `GET` route also answers `HEAD`, with the headers of the `GET` answer and no body. `OPTIONS` on a path that has routes answers `204` with an `Allow` header that lists the path's methods. Neither is listed as an operation unless a route declares it.

A request whose headers are larger than the HTTP server accepts is answered `431` before a route is chosen, so no operation lists it.

### Authentication
…
The Authentication operations answer errors in Better Auth's format, `application/json` with `message` and usually `code` (the `BetterAuthError` schema), and not as Problem Details. Only an answer RelKit sends before Better Auth runs, such as `403` for a request from another origin or `413` for an oversized body, is Problem Details.

Better Auth answers `HEAD` and `OPTIONS` on these paths itself; the two answers every other route gives do not apply to them.
```

The methods listed in the document are `delete`, `get`, `patch`, `post` and `put`; no operation lists 431. Observed: `HEAD /hello` 200 with `content-length: 27`; `OPTIONS /hello` 204 with `allow: GET, HEAD, OPTIONS`; `HEAD /api/auth/ok` and `OPTIONS /api/auth/ok` 404 from Better Auth.

**Better Auth operations.** 54 before, 53 after; `GET /api/auth/get-session` is listed, `POST /api/auth/get-session` is not.

## Not verified

- `relkit start` on the application. Its release build stops with `RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED` for the local-only bucket binding, so the listener of the built server was measured through the runtime adapter it uses, from the installed packages, on Node and on Bun.
- The Inspector page walk. This change does not touch the Inspector; `bun run test:inspector` covers it in the repository.
- Linux. Every run was on macOS.

## Observed, not part of this change

- The first `relkit dev` in a fresh worktree stopped after 20 seconds with `The new version exited with code 143 before it was ready` while the bucket's container was created for the first time; the second start was ready in 6 seconds.
- Under heavy machine load a start failed with `RELKIT_EVALUATOR_TIMEOUT` (10 s). It did not recur at normal load.
