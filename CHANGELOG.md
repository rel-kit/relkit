# Changelog

## Unreleased

## 0.7.20

### Fixed

- Two Inspectors connected to the same `relkit dev` session no longer lose each other's request, trace and log records. When an Inspector does miss records, it saves an "Inspection is incomplete" diagnostic naming the skipped range.
- Requests sent from the Inspector's API reference now reach origin-checked endpoints such as Better Auth sign-in and sign-up instead of failing with `403 MISSING_OR_NULL_ORIGIN`.
- The API reference now lists every Better Auth query parameter, marks required ones and describes union alternatives, so requests to endpoints such as `GET /account-info` no longer fail with `[query] Invalid input`.
- Refresh bundled dependency versions.
- The Inspector no longer answers `503 remote.error-invalid` when the application returns an error or redirect with a JSON content type and an empty body. The API reference shows the response's own status and headers.
- A request body that cannot be read, such as malformed JSON, the wrong content type or a body over the size limit, is reported as one validation issue for the whole body (`path: []`) instead of one per body field.
- A value rejected by a union of literals now reports the accepted values, for example `Expected one of: "a", "b"`, instead of `Value did not match any union member`.
- Better Auth `400 VALIDATION_ERROR` responses now name each missing or invalid field and include an `issues` list with each field's path. The `code` and status are unchanged.
- Declared errors and validation failures in `relkit dev` no longer turn into `500 internal-error` when Scalar, MCP or AG-UI is enabled. In development, a `500 internal-error` response now includes the redacted cause message.
- Request records and traces for raw routes, such as a Better Auth handler or a `/health` route defined with only a `handler`, now carry the route's ID instead of `unknown`.
- Requests that return a 4xx response without throwing are no longer recorded as successful in traces and request records.
- Requests that match no route now receive `404 {"error":"not-found"}` instead of plain text, or `405 {"error":"method-not-allowed"}` with an `Allow` header when the path exists under other methods.
- The Inspector's API reference keeps working after the app reloads instead of failing with `409 generation.stale` until the page is reloaded.

## 0.7.19

### New

- The Inspector UI is redesigned as a dense, dark-first developer tool with a light theme option, a ⌘K command palette, compact list and detail pages, and a full trace view with a span waterfall and step details.

### Fixed

- Stopping the Inspector no longer hangs when a browser is attached.
- Refresh bundled dependency versions.
- The Jobs pages show "This application defines no jobs." instead of "The jobs API is unavailable" for applications without jobs.
- The Inspector fails with a "port is already in use" message when its UI port is taken, and shuts down when the terminal closes. When another process holds project history, it names that process, suggests `--history-directory` and keeps retrying.

## 0.7.18

### Fixed

- The RelKit editor plugin no longer crashes tsserver when a plugin chained after it copies the language service.
- Ctrl+C stops `relkit inspector` and exits with code 130 instead of leaving it running in the background.
- Successful Inspector UI polling is no longer logged at INFO.
- Inspector failure logs name their cause, and a process-group SIGTERM no longer stops the history worker before the Inspector saves its history.

## 0.7.17

### New

- The Inspector's application graph is a hierarchical explorer with overview, domain and request flow views. Agent graphs move under a new AI sidebar group.

### Fixed

- Refresh bundled dependency versions.

## 0.7.16

### Fixed

- Refresh bundled dependency versions.
- The TSDoc `@see` links for `defineConstants`, `definePrompt`, `RelkitClientProvider` and `useRelkitClient` point at relkit.dev instead of a retired host.

## 0.7.15

### New

- `relkit add inspector` sets up the Inspector as a project devDependency and `relkit inspector [--port] [--hostname]` runs it, so inspection no longer needs a global install.
- New applications use the Scalar API reference (`server.apiDocs.ui: "scalar"`), and the create summary links to a served backend endpoint.

## 0.7.14

### New

- `relkit dev` applies `inspector.enabled` and `inspector.connection` changes on reload, so a running Inspector connects without restarting `relkit dev`.

### Fixed

- Refresh bundled dependency versions.

## 0.7.13

### Fixed

- Refresh bundled dependency versions.

## 0.7.12

### Breaking

- Development inspection is off by default, and the Inspector UI, collector and history move to the separately installed `@relkit/inspector` package. [Migration](https://relkit.dev/docs/modules/operations/inspector)

### New

- Native agent APIs and test helpers ship in `@relkit/langchain`, local diagnostic storage in `@relkit/observability-local`, and native auth and database testing in separate testing entry points, so ordinary installations carry no native SDKs you did not select.
- The Inspector has its own Docker build that runs as a non-root user and keeps project history between runs.

### Fixed

- Selected integrations check their installed peer versions before configuration, startup or deployment.
- Production builds leave out rich inspection even when development inspection is enabled.
- Auth scaffolds keep Better Auth 1.7.1 schema history and include the official fetch typing fix.
- Versioning and packaging are checked before each merge, and dependency security updates go through each package's catalog and lockfile.

## 0.7.11

### Fixed

- Fix Inspector cold startup, failed reload visibility and decoded runtime environment values.

## 0.7.10

### Fixed

- `relkit doctor` accepts independently versioned RelKit packages and still reports missing or incompatible ones.
- Scaffolds install each optional dependency at its own version instead of the generator's version.
- Generated provider dependencies resolve to each package's own release version.

## 0.7.9

### New

- The bundled application skills guide agents toward cohesive domain services.

## 0.7.8

### New

- Database migrations are centralized in the CLI, and the application guidance is refined.

## 0.7.7

### New

- Database and auth apps apply Drizzle migrations with a generated Bun SQLite migration runner, without a Node-only driver.
- Prepared development startup supports declarative SQLite/Drizzle and Better Auth applications. Generated SQLite services store their data under `.relkit/state`.

### Fixed

- Closing the terminal (SIGHUP) stops development with status 129 without leaving backend, Inspector or storage processes behind.
- Every starter's TypeScript program includes the generated context declarations, so database and auth context types are available in application functions.
- `relkit dev` picks up `.env` edits, keeps the last valid server during failed reloads, drops deleted values and forwards environment values to HTTP function invocations.
- Prepared startup isolates dotenv helpers from application preload settings and builds `asTool` tools eagerly only for verified functions.
- Prepared development accepts the generated context declaration and route parameter folders.
- Generated SQLite services validate database paths before setup and compile with the generic environment context.
- Releases are checked against complete packed project creation, and startup timing on shared hosts is reported separately.

## 0.7.6

### New

- Every starter bundles the RelKit application skills.
- New applications use the grouped `src/services/<name>/service.ts` layout, with a guarded layout migration for existing applications.

## 0.7.5

### Fixed

- The API reference documents auth endpoints, and `relkit dev` reuses its initial validation instead of repeating it.

## 0.7.4

### Fixed

- Project creation and prepared bundles work again.

## 0.7.3

### New

- Prepared generated apps start serving in under 500 ms.

## 0.7.2

### New

- The unscoped `relkit` package is published, so `bunx relkit` runs the RelKit CLI.

## 0.7.1

### Fixed

- Next.js and Hono are updated to patched versions, including `next` 16.3.8 in the full-stack template.
- Refresh bundled dependency versions.

## 0.7.0

### New

- The generator exposes Effect services next to its existing Promise APIs, and CLI operations support cancellation and clean up after themselves.

## 0.6.0

### New

- Database and authentication are available as Effect services next to the existing Promise APIs, with redacted telemetry for their operations. Native numeric schema ranges are validated.

## 0.5.6

### Fixed

- Core workflows run as scoped Effect services.

## 0.5.5

### Fixed

- Fix runtime regressions, and run execution services on Effect.

## 0.5.4

### Fixed

- Development and production builds no longer require the optional DeepAgents peer, and production containers still bundle it when it is installed.

## 0.5.3

### Fixed

- Update `next` from 16.3.3 to 16.3.6 in the CLI.
- Routes are checked against their method and inferred path input contracts, and `relkit dev` shows reload diagnostics.
- The API reference is refreshed for the reorganized authoring packages.

## 0.5.2

### Fixed

- Reorganize RelKit's internal foundations and make CI more stable.

## 0.5.1

### New

- The documentation walks through building and testing an Orders API.

## 0.5.0

### Breaking

- Jobs are task-first, with explicit task IDs, generated clients and provider capability diagnostics. Legacy function-target jobs and enqueue helpers remain only for a one-release compatibility window. [Migration](https://relkit.dev/docs/modules/jobs/migration)

### Fixed

- `@relkit/runtime-hono` tests clean up temporary state safely when cleanup runs more than once.

## 0.4.1

### New

- Streaming, realtime channels and presence, typed React clients, durable agent lifecycle support and shared Redis providers are available, with full-stack examples and documentation.
- The CLI scaffolds interactively, and new guides cover each kind of artifact.

### Fixed

- Scaffolds follow the release package version.

## 0.4.0

### New

- Requests are traced end to end, with live span details in the Inspector, strict W3C trace context propagation and OTLP/HTTP JSON export of traces and logs.

## 0.3.0

### New

- Development terminal logs are easier to read, and the Inspector has searchable logs and request traces stored in a local DuckDB database.

## 0.2.0

### Breaking

- `defineApp` bindings, explicit test replacements and separately installable integration packages replace the provider ownership contract and the old provider package exports, with no compatibility aliases. [Migration](https://relkit.dev/docs/learn/concepts/application)

## 0.1.0

### Breaking

- `defineEventFunction` consumers replace `onEvent` and selectors; events declare `input`, and functions declare the events they publish with `publishes`. [Migration](https://relkit.dev/docs/modules/events/consume)

### New

- API documentation can exclude selected domains.

## 0.0.5

### New

- Services are redesigned around domain-first applications.

## 0.0.4

### Fixed

- Refresh bundled dependency versions.

## 0.0.3

### Fixed

- Refresh bundled dependency versions.

## 0.0.2

### Fixed

- Refresh bundled dependency versions.

## 0.0.1 — Breaking

### New

- The first supported RelKit release, with typed application subpaths, self-contained project templates and trusted npm publishing.
- HTTP routes use named method exports from `src/routes/**/route.ts`, with method and path derived from the file system and routine request and response contracts inferred.
- Event listeners use typed `onEvent(name, handler, options?)` callbacks.
- Configuration uses `defineConfig` from `@relkit/app/config`, with fixed source and generated paths and `server` and `inspector` port settings.
- The CLI has nested help and completions, and development includes the Inspector, OpenAPI and Scalar.
- `examples/commerce` is the main runnable example, alongside a searchable documentation site and a redesigned Inspector.
