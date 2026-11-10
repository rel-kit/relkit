# Changelog

## Unreleased

## 0.9.0

### Breaking

- `@relkit/integrations` and `@relkit/providers-standard` are no longer published. `create-relkit` now carries the integration catalog, and `relkit add` refuses an integration package that is not part of the current release. The AWS deployment components from `@relkit/cloud-aws` now live inside `@relkit/aws`, and Pulumi is an optional peer dependency there. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- Set `auth: "required"` on each route that needs a session; a signed-out request gets a 401 problem before the route's middleware and function run, and both read the same session lookup. The Better Auth route no longer accepts `auth: { protected: [...] }`. To limit the MCP endpoint to signed-in callers, set `server.mcp: { auth: "required" }`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#route-auth).
- The `relkit` entry point exports only the Promise-based functions and the types applications write against, such as `defineFunction`, `defineRoute`, `fail`, `http` and their option and descriptor types. Every other name moves to its `relkit/<area>` subpath, for example `relkit/jobs` or `relkit/functions`. The Effect forms, such as `failEffect`, `defineFunctionEffect` and `httpEffects`, are in the new `relkit/effect` entry point, and `failEffect` now fails the Effect with the declared error instead of succeeding with a failure wrapper. `@relkit/app` keeps exporting every name it exported before. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- `defineAgent` from `@relkit/langchain` is removed. Define agents with `defineAgent` from `relkit/agents` and select LangChain with `runtime: langchain({ … })`, which holds LangChain's own model instances, tools, middleware and persistence options; a string `model` names a model profile. `relkit migrate` moves those options into `langchain({ … })`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#agent-runtime).
- `defineError` requires an `id`, because an error's ID is its public `code` in API responses and must not change when a file moves. `relkit check` reports `RELKIT_ERROR_ID_REQUIRED` at each error declared without one and suggests the ID earlier versions inferred, so adding it keeps the current public code. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#error-ids).
- Tool descriptors and function graph nodes no longer have an `invokeEffect` member, so their types carry no Effect types. Call `callToolEffect(tool, input)` or `callGraphNodeEffect(node, input)` from `relkit/effect` instead; `invoke` is unchanged. `InspectorConfig` is now a plain interface. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#one-spelling).
- Function descriptors no longer have `invoke()`, channel descriptors no longer have `trigger()` or `getPresence()`, and `defineFunction`, `defineTask` and `defineEventFunction` no longer accept `publishes`. Declare what a handler calls under `dependencies` and reach it through its context: `ctx.functions.priceOrder(input)`, `ctx.events.orderCreated.publish(payload)` and `ctx.channels.orderUpdates.trigger(params, event, payload)`. Code outside handlers, such as raw routes and middleware, uses `getRelkit()`, and tests call functions with `invokeFunction` from `@relkit/testing`. `bindFunctionEvents` takes only the consumed event, the `events` option of `@relkit/testing` event runtimes is gone, and the `RELKIT_EVENT_PUBLICATION_UNKNOWN` and `RELKIT_EVENT_PUBLICATION_DUPLICATE` checks no longer exist. Tool descriptors and graph nodes keep `invoke()`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#context-calls).
- The compiler, client generator and process supervisor are now part of `@relkit/cli`, and local diagnostic history is part of `@relkit/inspector`. The Pulumi deployment engine is part of `@relkit/pulumi`, and the Inspector bridge is part of `relkit`. `@relkit/compiler`, `@relkit/client-generator`, `@relkit/supervisor`, `@relkit/deploy-pulumi`, `@relkit/inspector-api` and `@relkit/observability-local` are no longer published. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- Serving, static files, WebSocket upgrades, hashing and environment access go through a runtime adapter. `relkit/runtime` defines the adapter contract and picks the adapter for the runtime the process runs on; `relkit/runtime/bun` and `relkit/runtime/node` are the Bun and Node adapters. `relkit/runtime-hono/bun` is removed; import `upgradeWebSocket` from `relkit/runtime/bun` instead. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- `relkit` is now the core package. It contains everything an application imports at run time (functions, services, routes, events, jobs, cache, buckets, schemas, config, agents and the runtime), from its root and from subpaths such as `relkit/functions` and `relkit/events`. The 25 internal packages it replaces, such as `@relkit/engine`, `@relkit/functions` and `@relkit/runtime-hono`, are no longer published. `@relkit/app` re-exports `relkit` and is deprecated. `relkit create` runs `create-relkit` at the same version instead of installing it with `relkit`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- Every HTTP error response is now RFC 9457 Problem Details with the `application/problem+json` content type: `type`, `title`, `status`, `code`, `detail`, `traceId`, and `data` or `issues` where they apply. Declared errors use their ID as `code`; RelKit's own errors use codes such as `validation`, `not-found`, `rate-limited` and `internal-error`. Branch on `code` instead of the old `error` field. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#problem-details).
- No package exports an `internal/*` subpath. The entry points RelKit's own packages share drop the `internal` segment, for example `relkit/host`, `@relkit/drizzle/server` and `create-relkit/add-types`; they are not supported application imports. `@relkit/cli/supervisor/internal/request` and `@relkit/inspector/observability-local/internal/local-worker` are removed. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#packages-and-imports).
- Route hooks (`useRoute`, `useSuspenseRoute`, `useRouteMutation`, `useInfiniteRoute`, `useRouteUtils` and `useStream`) take a property of the generated `api` object, such as `useRoute(api.orders.searchOrders, …)`, instead of a `"METHOD /path"` or route ID string, and a route's error type is a union you narrow on `code`. `useRouteMutation` no longer starts jobs; use `useJobTrigger`. `relkit migrate` rewrites string keys from the backend's client contract. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#client-hooks).
- `relkit add better-auth` declares `BETTER_AUTH_URL` without a default, next to `BETTER_AUTH_SECRET`; a server started without either fails with `RELKIT_ENVIRONMENT_INVALID`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#better-auth-file).
- Each concept has one spelling. The legacy function-target `defineJob` and the `relkit/jobs/legacy` entry point are gone with their queue runtime; use `defineTask` and a task-backed `defineJob`, and `relkit add job` now scaffolds one. A function's `ctx.jobs.<name>` now triggers a run (`trigger(input)` returns a run handle) instead of `enqueue`. `defineApp` keeps the `jobs` provider key and drops `job`, `defaults.job` and the `compatibility` option, and `defineJob` accepts `service` but no longer `profile`. The schema builder keeps `void()` and drops `undefined()`, `relkit/schema` keeps `getJsonSchema` and drops `toJsonSchema`, and `relkit/routes` keeps `defineTransform` and drops `defineRequestTransform`. `@relkit/testing` no longer has `createTestJob`, and `@relkit/aws` no longer has `createSqsJobProvider`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#one-spelling).

### New

- Provider conformance suites. `@relkit/testing` publishes the cache, buckets, realtime, events and jobs suites as `@relkit/testing/cache-conformance`, `/buckets-conformance`, `/realtime-conformance`, `/events-conformance` and `/jobs-conformance`, the same cases every first-party provider runs, with failure injection through a failing provider you supply. `runConformance` from `@relkit/testing/conformance` reports pass, fail or skip per case. The Cloudflare KV and R2 binding providers now reject an operation whose signal is already aborted.
- `relkit add better-auth` writes a plain Better Auth file, `better-auth.ts`, next to the auth service and no route file; RelKit mounts the handler at `--base-path`. The testing package serves auth from the service's own mount when no route mounts it.
- Workers-compatible clients. `@relkit/redis` accepts an `https://:<token>@host` URL and sends each command over HTTP (the Upstash REST protocol) for caches, which is the only Redis transport on Cloudflare Workers; realtime and agent state still need a `redis://` socket. `@relkit/cloudflare` adds `kvBinding({ binding })` and `r2Binding({ binding })`, a cache and a bucket on a Worker's own KV and R2 bindings, read through the new `workersBinding()` from `relkit/runtime/workers`. A Workers build loads integration modules statically, without the startup version check on disk.
- Calls made through `getRelkit()` and `createRelkit()` run with the new invocation source `system`, so traces, logs and `ctx.invocation.source` mark them as system calls, and the Inspector labels them "system call".
- `create-relkit` and the `relkit` CLI run on Node 22.13+ and 24 with npm or pnpm as well as on Bun. `npx create-relkit` and `pnpm dlx create-relkit` install with the manager that started them (or `--package-manager bun|npm|pnpm`), and `relkit dev`, `check`, `doctor`, `build` and `start` run on Node: application TypeScript runs through esbuild-based module hooks, `relkit build` bundles with esbuild and builds for Node by default there, and every change starts a new development generation. The runtime adapter gains `processes` (spawn, IPC, `which`) and `modules` (resolution and, on Bun, the evictable registry), and `createModuleReloader` takes the adapter's `modules`.
- A route module can export its `defineServiceRoutes` map directly with `export default defineServiceRoutes(service, { GET: "getOrder", POST: "createOrder" })`, and each method compiles to the same route as a `defineRoute` export. `relkit add route` writes this form. The editor plugin no longer offers the "Destructure the HTTP method" quick fix, and its route diagnostic now points to the default export. The destructured form still compiles.
- A function route's `response` option sets the success status, headers and cookies from the function's output, for example `response: (order) => ({ status: 201, headers: { location: \`/orders/${order.orderId}\` } })`. The function is unchanged, so jobs and tools that call it are unaffected.
- A function handler may throw its declared errors as well as return them, and no longer has to raise every error in its `errors` list. Set `check: { unusedErrors: true }` in `defineApp` to have `relkit check` warn about a declared error a handler never raises.
- The npm descriptions of `relkit` and `create-relkit` now use the RelKit positioning sentence.
- Functions accept an `access` rule — `roles`, `resource:action` `permissions` and an `allow` predicate over the session and input — that the engine checks before the handler for every caller: HTTP routes, jobs, tasks, event consumers, tools, agent tool calls, MCP and the runtime handle. A signed-in caller who fails it gets `access-denied` (403 over HTTP) and a caller without a session gets `unauthenticated` (401). Runtime-handle calls run as the `system` caller, which passes every rule, and `relkit.as(session)` returns a handle whose calls run as that user.
- `createRelkit(config)` gives scripts, seeders and other frameworks the same runtime handle as `getRelkit()`. It activates the built application's providers from `.relkit/build` without an HTTP listener, event consumers or job workers, and `close()` releases them so the process can exit. Run `relkit build` first; without a build it throws `RELKIT_APPLICATION_BUILD_UNAVAILABLE`. The generated server entry now exports `activateRelkitApplication` and still starts itself when run directly.
- Labs packages tag every export `@experimental`, and every package declares its Core or Labs tier in `relkit.maturity` ([Core and Labs](https://relkit.dev/docs/maturity)).
- Middleware can declare the data it provides: `defineMiddleware(path, { provides: schema, handler })` gives the handler `relkit.provide(data)`, which validates the data against the schema. Routes map a provided field into their function's input with `http.from(middleware, "field")`, typed from the schema; the generated client and OpenAPI leave such fields out. `defineMiddleware(path, handler)` keeps working for Hono-style middleware.
- `getRelkit()` returns the running application's handle in code outside function handlers, such as raw routes, middleware and the new `server.onStart` callback in `defineApp`. The handle groups functions, events, tasks and jobs by service and member (`getRelkit().functions.orders.getOrder(input)`), keys caches, buckets, channels and agents by ID, and exposes the default database as `database`. It is read from asynchronous context, never from a process global; outside an application it throws `RELKIT_APPLICATION_NOT_RUNNING`. `server.onStart` runs once after providers are ready and before the server accepts requests.
- `relkit check` finds community integration packages. Besides `relkit` and `@relkit/*`, imports of packages named `relkit-<name>` or `@<scope>/relkit-<name>` are read for `relkit.integration` metadata, so a provider published outside the `@relkit` scope can be selected in `relkit.config.ts`. The provider starter in `templates/provider-starter` and the new "Build and test a provider" guide show the full path from a new package to an installed provider.
- Adapter conformance suites. `@relkit/testing/runtime-conformance` checks a runtime adapter from inside its runtime, and `@relkit/testing/deploy-target-conformance` checks a `relkit deploy init` target. Deploy targets are now a public interface: `DeployTarget` and the Railway, Vercel and Cloudflare targets are exported from `@relkit/cli/deploy-targets`, and `relkit deploy init` dispatches through them with unchanged output. The agent adapter harness reports through `runConformance` like the other suites.
- Route authentication and function access rules are visible. Function graph nodes record `access` (roles, permissions and `predicate: true` for an `allow` check); OpenAPI operations of routes with `auth: "required"` or a protected function declare the `session` cookie security requirement, 401 and 403 problem responses and `x-relkit.auth` / `x-relkit.access`; and the Inspector's graph and route views show the access rule next to the route's auth requirement.
- `defineBetterAuthService({ auth })` takes the instance from your own Better Auth file (`export const auth = betterAuth({...})`). RelKit rebuilds it from `auth.options` when the server starts, adding your Drizzle database only when `database` is unset, and mounts its handler at `basePath` (`/api/auth` by default) unless you pass `mount: false`, so no auth route file is needed. The session type comes from the instance. Passing Better Auth options directly is deprecated.
- Every RelKit error the CLI prints is followed by the next step and a link to the code's page, and the docs list every code at [Error codes](https://relkit.dev/docs/errors).
- Applications no longer need `effect` as a direct dependency. The generated `runtime-integrations.ts` checks and loads integrations through Promise APIs in `relkit/host`, and new projects from `create-relkit` no longer list `effect`. An existing project can remove `effect` from its `package.json` unless its own code imports it.
- Function access rules read roles and permissions from Better Auth. With the organization plugin, a caller's roles are their member role in the session's active organization and `resource:action` permissions are checked against the plugin's access control, including dynamic roles; without it, roles come from the admin plugin's `user.role`. `resolveBetterAuthAccess(auth, session)` is exported from `@relkit/better-auth/drizzle`, and the generated server uses it for HTTP, MCP and `relkit.as(session)` calls.
- `createTestApplication` sends `testApp.http` requests to a running server when `RELKIT_TEST_SERVER_URL` is set, so an application's HTTP tests can check its production build on Bun or Node. Requests without an `Origin` header get the server's own origin, as a browser on the app would send. Members that need the in-process application, such as `testApp.runtime` and `testApp.fakes`, throw an explanation in that mode.
- `relkit deploy init cloudflare` writes `wrangler.jsonc` (the Workers build, `nodejs_compat`, static assets, and the KV, R2, Durable Object, queue and Cron Trigger bindings the application graph needs), the Worker entry `worker.mjs` and `.github/workflows/cloudflare-deploy.yml`. Existing identical files are kept and differing ones need `--force`; no cloud resource changes.
- `relkit build --runtime node` builds the production server for Node: the bundle targets Node, the server listens through the Node runtime adapter, `manifest.json` records `"runtime": "node"`, and the Dockerfile installs production dependencies with Bun and runs `node server/index.js` on a pinned `node:24` image. `relkit build` without the option still builds for Bun.
- `aiSdk({ … })` is the Vercel AI SDK agent adapter for `defineAgent({ runtime })`: declaring an agent loads nothing from the AI SDK, and the generated server imports the adapter's runtime entry only for agents that select it. The adapter runs the shared agent conformance suite from `@relkit/testing/agents-conformance`.
- Redis, Sentry and SQLite run on Node as well as Bun. `@relkit/redis` keeps Bun's built-in client on Bun and uses `ioredis` on Node, with the same no-retry, no-offline-queue policy. `@relkit/sentry` loads `@sentry/bun` on Bun and `@sentry/node` on Node, so `relkit add sentry` installs both. `openSqliteDatabase(path)` from `@relkit/drizzle/sqlite` opens a Drizzle SQLite database with `bun:sqlite` on Bun and `node:sqlite` on Node 22.13 or later.
- `relkit check` refuses providers that cannot run on Cloudflare Workers when the project has a wrangler configuration (`wrangler.jsonc`, `wrangler.json` or `wrangler.toml`): a used profile on the local provider, a job or event provider with a worker loop, or no provider fails with `RELKIT_WORKERS_PROVIDER_UNSUPPORTED`, and a SQLite database with `RELKIT_WORKERS_SQLITE_UNSUPPORTED`. Each diagnostic names the provider and one that runs on Workers.
- `relkit migrate` upgrades a 0.8 application to 0.9. It previews by default, applies with `--write` and undoes with `--rollback <record>`, and lists each place it cannot change with file and line. `relkit migrate layout` is unchanged. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
- These packages list Node LTS (`>=22.13.0`) beside Bun (`>=1.3.10`) in `engines`. `@relkit/cli`, `create-relkit`, `@relkit/testing` and `@relkit/aws` still require Bun.
- `relkit build --runtime workers` builds a Cloudflare Workers bundle: `.relkit/build/server/index.js` exports a `fetch` handler that activates the server once per isolate without a listener, and includes every dependency. The new `relkit/runtime/workers` adapter has no listener, filesystem or child processes; Workers need the `nodejs_compat` compatibility flag, and `public/` is served by Workers static assets. `relkit start` refuses a Workers build.
- Functions and tasks can declare `functions`, `events`, `channels` and `databases` under `dependencies`, next to `tasks`, `jobs`, `buckets`, `cache` and `agents`. Handlers reach each one as `ctx.functions.priceOrder(input)`, `ctx.events.orderCreated.publish(payload)`, `ctx.channels.orderUpdates.trigger(params, event, payload)` and `ctx.databases.<name>`, typed from the declared descriptor, and the application graph draws `calls-function`, `publishes-event`, `triggers-channel` and `uses-database` edges from these declarations. `relkit check` reports a `databases` entry that is not a Drizzle service. `ctx.database` still refers to the default database without a declaration.
- An application can define several Drizzle services. Mark one with `defineDrizzleService({ default: true })`: it is `ctx.database`, the handle's `database` and the Better Auth database, while every service is available as `ctx.databases.<name>` when a function declares it under `dependencies.databases`, typed with that service's own models. A single service is the default without the flag; with several, `relkit check` requires exactly one.
- Creation offers all five templates (`minimal`, `api`, `agent`, `fullstack`, `tasks`) and works on current Bun: a combination CI has not tested prints a `RELKIT_CREATE_UNTESTED` warning and continues, and `--strict` refuses it before writing any file. `create-relkit --help` lists the options. The `tasks` template now installs its jobs provider's SDK, and creation checks a project the prepared development snapshot cannot capture instead of failing. Local Docker job workers now resolve project packages, which Bun could not find through `NODE_PATH`. `relkit doctor` accepts Bun releases newer than the version a project was created with.
- `relkit/schema` exports the built-in schema builder as `s`. `z` remains as a deprecated alias of the same builder; `relkit migrate` rewrites it to `s`.
- Cloudflare durable services. The Workers entry gains `queue` and `scheduled` handlers that run due jobs, schedules and event deliveries from the Postgres backend, and every request that may submit work wakes the `RELKIT_WORK` queue. `@relkit/postgres` connects once per operation on Workers, where sockets cannot outlive a request. `@relkit/cloudflare` adds `durableObjectRealtime({ binding })` and the `RelkitRealtimeState` Durable Object (`@relkit/cloudflare/workers`), which the Workers build exports when the graph uses it. `relkit check` accepts the Postgres backend and Durable Object realtime on Workers.
- Function, event, task, error and agent contracts accept ArkType, Valibot (with `@valibot/to-json-schema`) and Effect Schema alongside Zod 4, new projects use Zod 4, and the installed schema library versions are part of the build fingerprint. [Supported libraries](https://relkit.dev/docs/learn/concepts/schemas#choose-a-schema-library)

### Fixed

- Messages and documentation spell the product name "RelKit", and each package declares whether it is Core or Labs in its manifest and API documentation.
- `@relkit/client` now carries `@opentelemetry/api` as a dependency instead of a required peer. The oRPC packages it is built on import that package's types in their declarations, so it must be present, but a frontend should not have to install a package it never calls; installing the client alone is enough under every package manager.
- The bundled agent skill reference documents `defineAgent` from `relkit/agents` with a `runtime` adapter, the `langchain()` and `aiSdk()` adapters and model profiles, instead of the removed generic `defineAgent`.
- The Docker integration runs `docker` through `node:child_process` instead of `Bun.spawn`, so local services work when the CLI runs on Node. Timeouts, output limits, cancellation and the error codes are unchanged.
- `relkit check` passes on a project that still imports the final `@relkit/app`. The package's deprecation notice is reported as a `RELKIT_DEPRECATED_APP_PACKAGE` warning on the importing file instead of failing the check with `RELKIT_EVALUATOR_SIDE_EFFECT`.
- RelKit uses Hono 4.13.16; pre-release and patched dependencies are listed in the [dependency policy](https://github.com/rel-kit/relkit/blob/main/docs/dependencies.md).
- Ship the TypeScript default library with the CLI's bundled parser. The bundle looked for `lib.*.d.ts` at the path of the machine that built it, so anywhere else (a Docker build stage such as Railway's, or a published install) RelKit's route checks saw no global types and `relkit build` rejected every route with `RELKIT_ROUTE_MODULE_TYPE`.
- The `fullstack` template declares `@orpc/tanstack-query`, which the `@relkit/client` React provider imports, so `next build` succeeds in a new fullstack app.

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
