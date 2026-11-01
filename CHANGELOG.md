# Changelog

## Unreleased

## 0.7.20

### Changes

- Two Inspectors connected to the same `relkit dev` session no longer lose each other's records. Each Inspector now identifies itself when it collects, and the session only discards records that every Inspector still collecting has saved; an Inspector that stops collecting for 30 seconds no longer holds records back. Previously, whichever Inspector confirmed a batch first discarded it for both, so the other one's request, trace and log history silently missed requests. When an Inspector does miss records, it now saves an "Inspection is incomplete" diagnostic naming the skipped range instead of losing them silently. The early-retention status also reports the latest admitted `sequence`.
- Requests sent from the Inspector's API reference now reach origin-checked endpoints such as Better Auth sign-in and sign-up. The Inspector UI strips the browser's `Origin` before forwarding, and Better Auth answered `403 MISSING_OR_NULL_ORIGIN` because Node's `fetch` adds `sec-fetch-mode`, which makes Better Auth require an origin. `relkit dev` now addresses every token-authenticated Inspector request to the application's public listener with a matching `Origin`, so it is handled like a call from the application's own page. When the app's `BETTER_AUTH_URL` is a loopback URL, its origin is sent instead, so it matches Better Auth's trusted origin: for example `http://localhost:3000` rather than `http://127.0.0.1:3000`, or a frontend served on another port. Cross-origin browser requests to the Inspector are still rejected, and the bridge still requires its session token.
- The API reference now documents every Better Auth query parameter. Better Auth's generator only reads a plain object query schema and never marks a field required, so endpoints such as `GET /account-info` (a union of `accountId` or `useAccountCookie`), `GET /get-session`, `POST /reset-password`, the OAuth callback and several organization, admin and magic-link endpoints showed no query fields, and Scalar sent requests that failed with `[query] Invalid input`. Query parameters are now derived from each endpoint's own schema, required fields are marked, and union endpoints describe their alternatives. Parameters an endpoint authors explicitly are kept.
- Refresh bundled dependency versions.
- The Inspector no longer answers `503 remote.error-invalid` when the application returns an error or redirect with a JSON content type and an empty body. Better Auth does this for redirects such as `GET /api/auth/callback/{id}` and `GET /api/auth/reset-password/{token}`, and for disabled routes such as `POST /api/auth/delete-user`. These responses now reach the API reference with their own status and headers.
- A request body that cannot be read, such as malformed JSON, the wrong content type or a body over the size limit, is now reported as one validation issue for the whole body (`path: []`) instead of the same issue repeated once for every body field.
- A value rejected by a union of literals, such as an enum built from `z.union([z.literal("a"), z.literal("b")])`, now reports the accepted values, for example `Expected one of: "a", "b"`, instead of `Value did not match any union member`.
- Better Auth validation errors now say which fields are wrong. Better Auth reports only each issue's top-level message, so a request that matched none of an endpoint's accepted query shapes answered `[query] Invalid input`. When Better Auth answers `400 VALIDATION_ERROR`, RELKIT re-runs that endpoint's own schema on the same input and returns a message that names each missing or invalid field, for example `[query] Must match one of 2 shapes: (accountId: required, expected string) or (useAccountCookie: required, expected true)`, plus an `issues` list with each field's path. A field that belongs to a different accepted shape is named, for example `[query.useAccountCookie] Cannot be combined with the other fields sent; send one of: accountId, userId? | useAccountCookie, userId?`. A value of the wrong type shows what was received, such as `expected true, received the text "true"`. The `code` and status are unchanged, and any other response is returned as is.
- Declared errors and validation failures no longer turn into `500 internal-error` when two copies of `@relkit/invocation` are loaded. This happened in `relkit dev` whenever Scalar, MCP or AG-UI was enabled, because the generated server bundles the framework while `@relkit/runtime-hono` loads its own copy from `node_modules`. A function's `fail(Unauthenticated)` therefore answered 500 instead of 401, and invalid query input answered 500 instead of 422. `RuntimeFailure`, `InvocationValidationError`, `RecursionPolicyError` and `DescriptorIdentityError` are now recognized across package copies, and the private failure cause store and descriptor identity registry are shared between copies. In development, a `500 internal-error` response now includes the redacted cause message, the same way provider failures already do.
- Request records and traces for raw routes, such as a Better Auth handler or a `/health` route defined with only a `handler`, now carry the route's ID instead of `unknown`, so the Inspector can group and filter them like other routes.
- Requests that return a 4xx response without throwing are no longer recorded as successful. Raw routes such as Better Auth, unknown-route 404s and middleware rejections returned their error response directly, so traces and request records showed `success` next to `HTTP 400`. A response that is still `success` when it finishes is now classified by its status: 400 and 422 as `validation-error`, other 4xx as `declared-error`, and 5xx as `defect` as before. Failures already recorded from a thrown error keep their outcome.
- Requests that match no route now receive JSON like other framework errors: `404 {"error":"not-found"}` instead of the plain-text `404 Not Found`. When the path exists under other methods, the response is `405 {"error":"method-not-allowed"}` with an `Allow` header listing them.
- The Inspector's API reference keeps working after the app reloads. It used to pin the generation it was opened with, so after any source edit every POST, PUT, PATCH or DELETE it sent failed with `409 generation.stale` until the page was reloaded by hand. Before each request it now reads the app's current generation with a lightweight `HEAD` request and sends against the current code. When the generation changed, the reference document is downloaded once and shown after that request's response arrives.

## 0.7.19

### Changes

- Stopping the inspector no longer hangs when a browser is attached. Bun can leave a forced listener stop unconfirmed when a peer was killed mid-stream (the UI holding a browser's live feed), and the inspector waited on it forever, leaving the process running after Ctrl+C, `kill` or a closed terminal. Listener retirement now waits at most two seconds for that confirmation, logs a warning, and finishes shutting down.
- Refresh bundled dependency versions.
- Redesign the Inspector UI as a dense, dark-first developer tool. Dark is the default theme (light is still one click away and remembered), with Geist Sans/Mono, OKLCH design tokens and no theme flash on load. The shell gains per-page entity counts in the sidebar, a compact generation pill, and a command palette (⌘K) that searches routes, functions, jobs, events, agents and tools as well as pages. Every list page uses a one-line filter bar and a compact table; every detail page shares one layout with an identity header, copyable ids and a contract rail. Logs, requests and trace lists follow Neon UI's logs viewer and query-history patterns (level chips, ANSI colours, duration bars). Traces open as a full view: a summary of the request, its lifecycle phases in time order, a tree waterfall on the trace's own clock (nested spans as bars, events as points, collapsible parents, arrow-key navigation) and the selected step's timing, input, output, error, events and attributes always visible beside it; domains, environment and bucket/cache browsers become searchable trees, and the overview becomes a dashboard of health, counts, recent requests and generation history. Components adapted from Neon UI and dashboardblocks are MIT-licensed; their notices ship in `THIRD_PARTY_NOTICES.txt`.
- The Jobs pages no longer report "The jobs API is unavailable" for applications that define no jobs. Jobs routes are mounted only when an application declares jobs, so the inspector now shows "This application defines no jobs." on Definitions, Runs, Schedules and Services. A plain-text error reply keeps its HTTP status instead of being treated as invalid JSON, which also stops the burst of retried 404 requests.
- Recover from a stale inspector that is still running. The inspector now checks that its UI port is free before starting the UI, and fails with a clear "port is already in use" message that names the address, instead of reporting "listening" while another server answers on that port. When project history is locked by another process, a warning names the lock holder's PID and suggests `--history-directory`. After three quick attempts the inspector keeps retrying every 30 seconds, so history resumes without a restart once the other process exits. Closing the terminal (SIGHUP) now shuts the inspector down like Ctrl+C, so its UI and history worker no longer outlive it.
- feat(inspector): dark-first UI redesign, clearer traces, and shutdown fixes

## 0.7.18

### Changes

- Fix four inspector terminal problems. The editor plugin keeps its forwarded language-service methods enumerable, so editor plugins chained after it that copy the service with object spread no longer crash tsserver (#160). `relkit inspector` no longer starts a spinner, so Ctrl+C exits 130 and stops the inspector instead of leaving it running in the background (#162). Successful UI polling is no longer logged at INFO (#163). Failure logs from observed operations name their cause (error tag, operation label, native code, HTTP status) without native messages, and the history worker survives a process-group SIGTERM until the inspector flushes and closes it (#164).

## 0.7.17

### Changes

- Refresh bundled dependency versions.
- Redesign the Inspector application graph as a hierarchical explorer. The default view shows route groups, domains, events and channels with auth and the database in a side column; a domain view opens one domain's routes, functions and neighbours; a flow view follows a request from route through middleware, handler, calls, tables, events, listeners and realtime channels to its response. Routes behind middleware carry a lock with the ordered middleware names, selecting a card lights its full downstream path, and an icon bar shows only the selected kinds. Agent graphs move under a new AI sidebar group.

## 0.7.16

### Changes

- Refresh bundled dependency versions.
- Point the TSDoc `@see` links for `defineConstants`, `definePrompt`, `RelkitClientProvider` and `useRelkitClient` at the documentation on relkit.dev instead of the retired Railway host.

## 0.7.15

### Changes

- Add `relkit add inspector`, which enables `inspector.enabled`, installs `@relkit/inspector` as a project devDependency and adds an `inspector` script, and `relkit inspector [--port] [--hostname]`, which runs that project-local UI, so inspection no longer needs a global install. New applications select the Scalar API reference (`server.apiDocs.ui: "scalar"`), so `relkit dev` advertises it, and the create summary's backend link now points at a served endpoint instead of the unrouted root.

## 0.7.14

### Changes

- `relkit dev` now applies `inspector.enabled` and `inspector.connection` changes on reload. Enabling inspection starts the session bridge, telemetry capture and discovery descriptor once the rebuilt generation is serving, so an already-running standalone Inspector connects without restarting `relkit dev`; disabling it stops the bridge and closes the telemetry ingress once the previous generation has drained, and a connection change rebinds the bridge. Re-enabling keeps recording history under the same session, and a bridge that failed to start is retried on the next reload.
- Refresh bundled dependency versions.

## 0.7.13

### Changes

- chore(deps): bump the npm_and_yarn group across 5 directories with 3 updates

## 0.7.12

### Changes

- Bootstrap release tooling in clean installations and validate versioning and packaging before merging. Normalize dependency security updates through their owning catalog and lockfile, with automatic Changesets prepared by trusted repository automation.
- Fix/lean installation and standalone inspector
- Keep ordinary backend, generic client and testing installations free of unselected native SDKs. Selected integrations declare optional peers and validate their actual installed versions before configuration evaluation, startup or deployment. Move native agent APIs and test helpers to `@relkit/langchain`, local diagnostic storage to `@relkit/observability-local`, and native auth/database testing to explicit testing leaves. Frontend clients and optional HTTP transports remain explicit selections. Runtime lifecycle belongs to the engine; production starts emitted JavaScript with an exact selected dependency manifest. The legacy CLI inspector remains a Stage 1 development dependency. The lightweight creator owns new project creation; existing project editing belongs to the CLI. The wrapper resolves compatible project-local tooling, and the catalog contains metadata only. Selected auth scaffolds preserve Better Auth 1.7.1 schema history and the existing Drizzle patch while carrying the official fetch typing fix. These packages retain independent versions. Existing package minor releases carry the intentional import and dependency-policy changes; the new native packages have their own initial release identities. No publication or version command is included.
- Disable development inspection by default and move the UI, collector and diagnostic history into the separately installed `@relkit/inspector` tool. Enabled applications publish a private authenticated bridge that survives reloads; the CLI no longer installs or starts Next.js, React, DuckDB or a history worker. Production excludes rich inspection even when development inspection is enabled. Preserve project history with transactional replay receipts, bounded redacted capture and explicit incomplete states. Ship an independent non-root Docker build with directory credentials and persistent project-bound history. The tool keeps its own release identity; image and package publication require separate authorization.

## 0.7.11

### Changes

- Fix Inspector cold startup, failed reload visibility, and decoded runtime environment values.

## 0.7.10

### Changes

- Validate installed RELKIT packages against their own declared versions so doctor accepts independently versioned releases and still reports missing or incompatible installations. Use each optional scaffold dependency's own version rather than the generator version, and refresh the generator when any bundled scaffold dependency changes.
- Resolve generated provider dependencies using each package's own release version.

## 0.7.9

### Changes

- Guide cohesive domain services and add agent evaluations

## 0.7.8

### Changes

- feat: centralize database migrations and refine application guidance

## 0.7.7

### Changes

- Handle SIGHUP through invocation cancellation so prepared development joins its backend, inspector, and storage workers before exiting with status 129. Terminal hangup now retains shutdown diagnostics instead of leaving orphaned children.
- Require complete packed creation functionality for release admission and report shared-host startup performance separately without discarding slow samples.
- Generate a native Bun SQLite migration runner so database and auth apps can apply Drizzle migrations without selecting a Node-only driver. Include generated context declarations in every starter's TypeScript program so database and auth context types are available to application functions.
- Refresh development candidate environments after dotenv edits and observe dotenv repairs in prepared sessions. Preserve the last valid server during failed reloads and remove deleted file-managed values from subsequent candidates. Forward resolved application environment values to HTTP function invocations. Keep manual source-watcher admission synchronous while retaining lazy watcher loading for CLI sessions.
- Require proven function descriptor provenance for eager `asTool` construction during prepared startup. Isolate dotenv helper execution from application preload configuration and inherited runtime options while preserving those options for application candidates.
- Accept the generated context declaration and parameter route folders during development snapshot preparation, integrity verification, and input watching while retaining containment and generated-root checks.
- Support declarative SQLite/Drizzle and Better Auth applications in prepared development startup. Audit SQLite metadata callbacks and literal descriptor options, defer native database client lifecycle work until activation, and reject ambient values, eager clients and imports outside the audited backend sources. Tooling stays fingerprinted without being evaluated during eligibility checking. Generated SQLite services store mutable data under `.relkit/state` and create missing parent directories only during migration or runtime client acquisition. Validate and narrow database paths before filesystem setup so generated services also compile with the generic environment context.

## 0.7.6

### Changes

- feat(generator): bundle RELKIT application skills in every starter
- feat: adopt grouped service layout and guarded migrations

## 0.7.5

### Changes

- fix: document auth endpoints and reuse initial dev validation

## 0.7.4

### Changes

- fix: restore certified creation and prepared bundles

## 0.7.3

### Changes

- feat: serve prepared generated apps in under 500 ms

## 0.7.2

### Changes

- Publish the unscoped relkit package so bunx relkit runs the existing RELKIT CLI.

## 0.7.1

### Changes

- Update shared Next.js and Hono dependencies to patched versions and retain the Next.js template security fix through release synchronization.
- chore(deps): bump next from 16.3.6 to 16.3.8 in /templates/default/v1/fullstack
- chore(deps): bump the bun-dependencies group across 1 directory with 24 updates

## 0.7.0

### Changes

- Expose generator services built with Effect and resolve portable dependency catalogs and declaration patches. Preserve existing Promise APIs, move command execution to dedicated bins, and give CLI operations explicit cancellation and cleanup ownership.

## 0.6.0

### Changes

- Add Effect-native database ownership and authentication services while preserving existing Promise APIs. Keep transaction descendants and native auth initialization within database admission, validate native numeric schema ranges, and expose redacted specialized operation telemetry.

## 0.5.6

### Changes

- Refactor core consumer workflows into scoped Effect services

## 0.5.5

### Changes

- Refactor execution services with Effect and fix runtime regressions

## 0.5.4

### Changes

- Allow development and production builds without the optional DeepAgents peer installed. Keep installed DeepAgents dependencies bundled for standalone production containers.

## 0.5.3

### Changes

- chore(deps): bump next from 16.3.3 to 16.3.6 in /packages/cli
- Refactor compilation and generated contracts and enforce route authoring
- Refactor RELKIT authoring packages and refresh API docs

## 0.5.2

### Changes

- Refactor RELKIT foundations and stabilize fast CI

## 0.5.1

### Changes

- docs: guide developers through a verified Orders API

## 0.5.0

### Changes

- test(runtime-hono): make temp state cleanup idempotent
- Adopt task-first durable jobs with explicit task identity, job admission, generated clients, and provider-specific capability diagnostics. Legacy function-target jobs and enqueue helpers remain behind the one-release compatibility window; migrate with the jobs migration guide before the next major release.

## 0.4.1

### Changes

- fix(scaffold): follow release package version
- Add generic streaming, realtime channels and presence, typed React clients, durable agent lifecycle support, shared Redis providers, and full-stack examples and documentation.
- feat(cli): add interactive scaffolding and comprehensive artifact guides

## 0.4.0

### Changes

- Add request-centric runtime instrumentation, canonical model v2 execution records, live Inspector span details, strict W3C propagation, and OTLP/HTTP JSON trace and log export.

## 0.3.0

### Changes

- Make development terminal logs readable and persist local telemetry in a CLI-owned DuckDB store. Add searchable inspector logs with stable live updates and request lifecycle traces that keep correlated details beside the list.

## 0.2.0

### Changes

- Replace the pre-1.0 provider ownership contract and legacy provider package exports with `defineApp` bindings, explicit test replacements, and independently installable integration packages. This breaking cohort intentionally ships without compatibility aliases, old artifact readers, or migration tooling.

## 0.1.0

### Changes

- Replace `onEvent` and selectors with authored `defineEventFunction` consumers. Events declare `input`, and functions declare exact publication permissions with `publishes`. Event-only functions accept delivery and replay through the common runtime and cannot be invoked through HTTP, jobs, tools, services, or direct calls. This pre-1.0 breaking release updates compiler and manifest contracts, local and AWS delivery, deployment permissions, Inspector views, test helpers, examples, and generated templates together. Existing applications must migrate their event authoring and regenerate their artifacts; no compatibility aliases or persisted-state migration are provided. API documentation can also exclude selected domains.

## 0.0.5

### Changes

- Redesign services around domain-first applications

## 0.0.4

### Changes

- chore(deps): bump the bun-dependencies group with 2 updates

## 0.0.3

### Changes

- chore(deps): bump the bun-dependencies group with 6 updates

## 0.0.2

### Changes

- chore(deps): bump the bun-dependencies group across 1 directory with 27 updates

## 0.0.1 — Breaking

This pre-1.0 release intentionally breaks the previous authoring conventions:

- HTTP routes now use named method exports from `src/routes/**/route.ts`; method and path are derived from the file system, and routine request/response contracts are inferred.
- Event listeners now use typed `onEvent(name, handler, options?)` callbacks backed by the generated event registry.
- Configuration now uses `defineConfig` from `@relkit/app/config`, fixed source/generated paths, and `server`/`inspector` port settings.
- The CLI now has nested Effect CLI help and completions, and development ships the inspector plus OpenAPI and Scalar.
- `examples/commerce` is the canonical executable example; the searchable Fumadocs application and redesigned inspector cover the public framework surface.

There is no compatibility layer or codemod. Follow the [breaking-change migration guide](apps/docs/content/docs/operations/migration.mdx) and preserve explicit descriptor IDs while moving files.

### Changes

- Publish the first supported RELKIT release with protected CI, typed application subpaths, self-contained project templates, and trusted npm publishing.
