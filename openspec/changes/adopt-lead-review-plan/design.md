# Design

## Context

See proposal.md for why. The plan this change implements is
`docs/reviews/2026-11-02-relkit-lead-review.md`; its decision numbers (#1–#22) are used below.

Current state that shapes the approach:

- **Packaging.** 42 framework packages plus 14 integration packages, each with its own version.
  Applications import `@relkit/app/*`, which re-exports internal packages. Changesets has no `fixed`
  group.
- **Creation gate.** `packages/create-relkit/src/create-capabilities.ts` holds one allowed
  combination, pinned to exact release, Bun, TypeScript and catalog identities, and refuses everything
  else at run time.
- **Schemas.** The compiler projects function schemas in a `legacy` direction that only understands
  RelKit's own builder (`packages/schema/src/json-schema-inspection.ts`).
- **Runtime.** The engine, invocation, jobs and events packages are runtime-neutral; Bun coupling
  sits in the generated server (`Bun.serve`, `--target=bun`), static files, Redis (`Bun.RedisClient`),
  Sentry (`@sentry/bun`), SQLite (`bun:sqlite`) and the dev supervisor.
- **Dev loop.** Every save forks a compiler, evaluates all modules in a child process, builds a full
  TypeScript program, runs `bun build` and starts a new server process. A 7.7k-line snapshot cache
  speeds up only the first start, through hand-written eligibility lists.
- **Durability.** Events use a filesystem provider only; schedules tick inside the web process.
- **Errors and auth.** Five error body shapes; declared errors must be returned to type-check;
  protection is a path list on the Better Auth mount; `defineBetterAuthService` takes options and
  builds the instance at startup.
- **API surface.** 598 root exports including 206 `*Effect` functions; four ways to reach
  dependencies; the client calls oRPC's `/rpc` while everyone else uses REST.
- **In-flight work.** `lean-installation-and-standalone-inspector` modifies four requirements this
  change also changes; the deltas here build on its text.

Implementation follows the repository's conventions in `AGENTS.md`: Effect inside the framework, the
250-line file cap, konsistent structure rules and boundary checks.

## Goals / Non-Goals

**Goals:**

- Ship every breaking change in one release with one `relkit migrate` and one migration guide, after
  a beta; keep additive work free to land before or after it.
- Keep the application graph as the single source of truth: new behavior (access rules, dependency
  declarations, deploy targets) is expressed as graph data, not side channels.
- Make each new runtime, deploy target, backend and agent adapter pass a shared conformance suite, so
  support claims are tested rather than asserted.

**Non-Goals:**

- Escape hatches and eject (#17): deferred until a follow-up proposal.
- Completing RelKit's built-in schema builder to Zod parity.
- A RelKit-owned infrastructure engine or state store.
- Hosting the Inspector as a service; only its API is prepared for that.
- Rewriting Git history to remove committed evidence.

## Decisions

### D1. Package layout and one version (#6)

`relkit` contains authoring, runtime and a launcher bin; `@relkit/cli`, `@relkit/client`,
`@relkit/testing` and `@relkit/inspector` hold optional tools; integrations keep their own `@relkit/*`
packages. Internal boundaries that packages used to enforce move to `scripts/check-boundaries.ts` and
konsistent rules over source folders inside the merged packages. Changesets uses one `fixed` group
(`relkit`, `create-relkit`, `@relkit/*`). The `relkit` bin resolves the project's `@relkit/cli` the way
today's unscoped `relkit` wrapper resolves project-local tooling.

The review's starting map is adjusted where the dependency graph requires it:

- `graph` moves into `relkit`, not `@relkit/cli`. The engine, `runtime-effect`, `runtime-hono` and
  `openapi` read the application graph at run time, and it depends only on `effect`.
- The deploy integration contract (today's `deploy` package) moves into `relkit` as the public
  `relkit/deploy` subpath, because `@relkit/aws` and `@relkit/pulumi` implement it and must not depend
  on `@relkit/cli`. The Pulumi engine (`deploy-pulumi`) still moves into `@relkit/cli`.
- `inspector-api` moves into `relkit` as an area, not into `@relkit/inspector`. The CLI and the
  generated development server use its bridge and connection protocol, and `@relkit/inspector` ships
  the Next.js UI, so keeping the protocol in `relkit` stops every CLI install from pulling in the
  Inspector UI. Production builds do not bundle it.
- `deploy-pulumi` moves into `@relkit/pulumi`, which already exposes the engine as
  `@relkit/pulumi/engine`, so no integration depends on `@relkit/cli`. The CLI uses only its types.
- Inside `relkit`, each former package becomes a source folder (`src/<area>/`) with its tests in
  `tests/<area>/`, and areas import each other through relative paths. Each former package's public
  entry points stay reachable as `relkit/<area>` subpaths for first-party tools and integrations;
  `relkit/config`, `relkit/jobs` and `relkit/tasks` keep the application-facing superset that
  `@relkit/app` exported.
- Until the section 12 codemod migrates them, examples, templates and docs keep importing
  `@relkit/app`, which becomes the thin re-export of `relkit` that the deprecated final release ships.
- The former `internal/*` subpaths lose their `internal` segment (for example `relkit/host` for the
  generated server's runtime host, `@relkit/drizzle/server`, `relkit/agents/<module>`). They stay
  published because the CLI, the Inspector and integrations import them, and
  `scripts/first-party-exports.ts` lists them so the API reference and Labs checks treat them as
  first-party-only, not as supported application imports.

- **Alternative:** keep `@relkit/app` as the core name. Rejected: longer imports and it keeps the
  "which RelKit am I on?" problem.
- **Alternative:** ship the CLI inside `relkit`. Rejected: production installs would pull the
  compiler and TypeScript.

### D2. One breaking release (#6, #13–#16)

All breaking changes land on a release branch behind the new package names. `relkit migrate` is built
as a set of codemods (imports and package names, `.invoke()` and `.trigger()` call sites, dependency
declarations, explicit error IDs, removed aliases and legacy jobs, `defineServiceRoutes` exports,
Better Auth options to a Better Auth file, client hook call sites, agent `runtime` fields). The
codemods reuse the existing `migrate layout` transaction model: preview, write, and a rollback
receipt. Repository examples and templates are migrated with the codemod, never by hand, which tests
the codemod. A `0.9.0-beta` precedes `0.9.0`. The migration guide is published at
`/guides/migrate/relkit-0-9`; every breaking changeset links to it, because versioning rejects a
breaking change without a migration link.

- **Alternative:** several smaller breaking releases. Rejected by the maintainer in round 3.

### D3. Creation gate becomes a CI concern (#1)

The capability table stays as data that CI writes, but the creator compares only release and
template identity plus the runtime's major and minor version against tested combinations, and turns
a mismatch into a `RELKIT_CREATE_UNTESTED` warning. `--strict` restores refusal. A creation canary
creates every template on the latest Bun and Node: nightly with the published creator, opening an
issue on failure, and on pull requests that change creation with the creator packed from the pull
request, so the canary itself is proven before it merges.

- **Alternative:** keep the allow-list but refresh it faster. Rejected: any Bun patch release still
  breaks creation between refreshes.

### D4. Standard Schema projection (#4)

Projection order: RelKit builder metadata, then `~standard.jsonSchema` in the needed input or output
direction, then a library converter loaded lazily as an optional peer (Effect Schema, Valibot,
ArkType), else `RELKIT_SCHEMA_UNAVAILABLE`. Projected JSON is canonicalized (sorted keys, normalized
numbers) and each library's version joins the build fingerprint. The built-in builder is renamed `s`
and stays minimal; templates and docs use Zod 4.

- **Alternative:** extend the built-in builder to Zod parity. Rejected: large maintenance cost for an
  API the ecosystem already provides.

### D5. Core and Labs metadata (#5)

Each package declares maturity in `package.json` (`relkit.maturity`), Labs exports carry
`@experimental` TSDoc, and docs frontmatter carries a `labs: true` flag that renders the badge. A
repository check compares the three. The plan's Core list omitted built-in telemetry; this design
places it in Core because every application uses it.

### D6. Development loop (#9)

`relkit dev` keeps one warm evaluator process per session. On save it uses the compiler's watch
dependency index (`invalidateWatchDependencies`, today unused) to find changed modules and their
dependents, re-imports them under a fresh module URL, rebuilds the affected graph nodes, and, if
configuration, providers and route shape are unchanged, swaps the handler table in the running server
atomically. Otherwise it falls back to today's blue/green generation switch. Type-checking runs as a
parallel `tsc --watch` (or `tsgo`) process whose diagnostics stream to the CLI and Inspector. Dev
skips `bun build`. Benchmarks use generated apps with 10, 100 and 500 functions; a CI job records
reload p95 and `check` peak memory and publishes them to the docs. The snapshot cache is deleted
once the budgets hold.

- **Alternative:** a Vite-style module graph with HMR boundaries. Rejected: more machinery than
  handler swapping needs.
- **Alternative:** keep blue/green and optimize it. Rejected: a full process start cannot meet the
  budgets for large apps.

### D7. Runtime adapters (#10)

A runtime adapter interface covers serving, static files, WebSocket upgrade, crypto, environment
access and filesystem availability. The Bun adapter wraps today's code; the Node adapter uses Hono's
Node server; the Workers adapter exports a fetch handler with no filesystem. `relkit build --runtime
<bun|node|workers>` selects the adapter and bundle target. Bun-only clients get portable defaults: a
standard Redis client on Node, an HTTP-based Redis client for Workers, and a per-runtime SQLite
driver. A portability check bans `Bun.*` and `node:` imports outside adapters.

### D8. TypeScript 7 (#11)

Generated declaration files (`route-module-checks.ts`, context and event registries) carry every type
guarantee, so plain `tsc` reports everything the editor plugin reports. `relkit check` spawns the
project's compiler binary instead of calling `ts.createProgram`. Codemods and source scanning keep a
private `typescript@5.9` dependency as a parser until TypeScript 7 offers an equivalent API; the
dependency is bundled into `@relkit/cli` so it never constrains the application. The workspace moves
its own type-checking to TypeScript 7; tools that still need the 5.x API, such as the docs generator,
are checked and kept on the private parser if needed.

### D9. Deploy targets (#12)

`relkit build` emits a container definition (non-root, health endpoints, no local durable state) for
Bun and Node, and a Workers bundle. `relkit deploy init <target>` writes target files and a CI
workflow: Railway gets `railway.json` plus the container files; Vercel gets `vercel.json` and a Node
function entry; Cloudflare gets `wrangler.jsonc` and the Workers entry. A target uses Pulumi only when
a maintained provider exists. AWS keeps its Pulumi program and moves to Labs until it builds and
pushes images, serves HTTPS, runs several tasks and passes a real deploy test.

### D10. Postgres durable backend (#12)

Tables hold jobs (leased with `FOR UPDATE SKIP LOCKED`), an event outbox written in the caller's
Drizzle transaction, per-consumer deliveries, and schedule occurrences with a unique key on schedule
ID and occurrence time so that only one instance enqueues each occurrence. Workers can run inside the
web process for single-instance apps or as a separate worker role. The first implementation step
evaluates wrapping an existing Postgres queue library behind the provider interface; either way, the
shared jobs and events conformance suites decide.

Decided while applying section 16 (maintainer, 2026-11-05):

- **The backend is RelKit's own SQL on `@effect/sql-pg`, not a wrapped queue library.** A spike
  wrapped pg-boss 10.4 behind the jobs fixture steps against Postgres 16 (graphile-worker 0.16
  was evaluated from its source). Measured: pg-boss `retry` re-queues the same job ID instead of
  creating a linked run, a second `cancel` resolves silently instead of reporting
  `already-terminal`, `singletonKey` on a standard queue does not deduplicate, and an expired
  lease on an active job was still `active` 70 seconds later because recovery waits for its
  maintenance interval. graphile-worker hard-codes a four-hour lock timeout. Neither has
  per-consumer event delivery, and both own their schema migrations and add the `pg` driver,
  while their transactional enqueue needs a `pg` client rather than the caller's Drizzle
  transaction. Wrapping would keep only the `SKIP LOCKED` claim query. `@effect/sql-pg` is already
  in the catalog. The in-repo spike is `integrations/packages/postgres/tests/jobs-conformance.test.ts`,
  which runs every `runJobsConformance` fixture against the adapter.
- **The runtime creates its tables.** On first use each namespace (`schema`, `tablePrefix`)
  applies idempotent `create ... if not exists` DDL inside a transaction holding an advisory lock,
  so instances starting together create it once. Applications that own migrations apply the same
  statements from `postgresBackendSql()`.
- **Five stored states, ten public ones.** Rows store `queued`, `running`, `completed`, `failed`
  or `cancelled`; `delayed` and `retrying` are derived from the eligibility time and attempt
  count when read. A run that fails on its last permitted attempt, or with `retry: "never"`, ends
  `failed` and dead-lettered, reported as `nativeDiagnosticCode: RELKIT_JOB_DEAD_LETTERED`;
  `retry` creates a new run that is unique per (original run, retry identity).
- **An expired lease counts as an attempt.** Another worker re-claims the run while the task's
  `retry.maxAttempts` allows; otherwise it ends failed with `RELKIT_JOB_LEASE_EXPIRED`. Every
  settlement is fenced on the claim's owner token, so a worker that lost its lease cannot
  overwrite the next attempt. Workers renew leases every third of `leaseMs` (default 30 s), and
  the renewal reports cancellation requests, which abort the attempt's signal.
- **Deduplication follows the deterministic adapter.** The dedupe key is (job, idempotency key,
  occurrence identity), unique per service and scope. A submission whose commit outcome is unknown
  returns `RELKIT_JOB_SUBMISSION_UNKNOWN` with `retry-with-same-key` recovery when it had an
  idempotency key, else `inspect-native`. Durable sleep is reported unsupported.
- **Events fan out when they are written.** Registering a durable trigger records a consumer row
  (profile, trigger, event ID, version). Publishing is one statement that inserts the outbox row
  and one delivery per registered consumer, so `@relkit/postgres/drizzle`'s
  `outbox(tx).publish(event, payload)` commits or discards the event and every delivery with the
  caller's transaction, and needs no relay process. A consumer registered later does not receive
  events published before it. Each delivery is leased, retried under the trigger's retry policy
  (`planRetry`, the local provider's classification) and dead-lettered on its own. Ephemeral
  triggers run in-process after a provider `publish` and are not persisted; the outbox only
  serves durable consumers.
- **The outbox binds JSON as text.** It casts the envelope with `::text::jsonb`, because Bun's SQL
  driver JSON-encodes a string bound directly to a `jsonb` parameter and would store a jsonb
  string; the cast keeps every Drizzle Postgres driver writing the same object.
- **One run per occurrence comes from the occurrence key, not from locking alone.** A scheduler
  pass locks due schedule rows with `FOR UPDATE SKIP LOCKED`, inserts each occurrence into a table
  keyed on (service, schedule ID, occurrence time), enqueues the run in the same transaction with
  occurrence identity `<schedule>@<time>`, and advances the pending occurrence. A contender holding
  a stale pending occurrence loses on the key. `misfire` defaults to `latest`; `skip` drops
  occurrences more than a minute late; `all` catches up at most 100 per pass. `overlap: "skip"`
  claims the occurrence without a run while an earlier run of the schedule is queued or running.
  Re-upserting a schedule with unchanged timing keeps its pending occurrence, so a redeploy neither
  skips nor repeats one.
- **Worker modes reuse `RELKIT_WORKER_ROLE`.** The generated server already drives an adapter's
  pull `worker` from its job loop and skips it in the `api` role, and passes `startWorker: false` to
  `registerWorker` there. The Postgres runtime starts its scheduler from `registerWorker` and its
  event consumers when the role is `worker` (the default), so a single instance runs everything in
  the web process, and a deployment can run web instances with `RELKIT_WORKER_ROLE=api` beside
  one or more `worker` instances of the same build. Jobs and events providers of one process that
  name the same database and namespace share one pool. `RELKIT_POSTGRES_URL` overrides the
  authored URL. Not verified here: a full `relkit build` and `relkit start` of an application on
  this provider; the worker-mode tests build the providers through the same runtime integration
  the server uses, with a child process as the worker instance.
- **`relkit add jobs` and `relkit add events` add provider profiles.** They take
  `--provider postgres|local` (default `local`) and `--profile` (default: the provider name), and
  reuse the add transaction: the profile in `relkit.config.ts`, `@relkit/postgres` in
  `package.json` and the `DATABASE_URL` secret in the env module are planned together, installed
  and verified, and restored byte for byte when any step fails. The new profile becomes the
  default only when the app has none; otherwise a warning names the existing default, so the
  command never re-routes existing jobs or events silently.
- **The local-provider warning comes from the compiled graph.** `relkit build` adds one
  `RELKIT_BUILD_LOCAL_DURABLE_PROVIDER` warning per jobs or events profile whose adapter belongs
  to `@relkit/local` and that a job, schedule, event or event trigger uses. The build still
  succeeds; development (`relkit dev`) does not warn.
- **Docs examples are compiled sources.** The provider page (`docs/modules/jobs/providers/postgres`)
  and the at-least-once section of `docs/modules/jobs/retries-and-idempotency` include
  `apps/docs/examples/postgres/*.ts`, which the docs `tsc` checks. Retry policies are read as the
  task form (`initialDelay`, `maxDelay`, `factor`) or the millisecond form (`initialDelayMs`,
  `maxDelayMs`, `multiplier`).

### D11. Problem Details errors (#13 a, b)

Every error response becomes `application/problem+json` with `type` (`/errors/<code>`), `title`,
`status`, `code`, `detail`, optional `data`, `issues` for validation, and `traceId`; `Retry-After`
stays. OpenAPI declares one problem schema per declared error. Handler result types accept thrown
declared errors; the "every declared error is raised" check moves to an opt-in lint rule.

### D12. Auth model (#13 d, g)

Route `auth: "required"` is checked before middleware and the target. The Better Auth
protected-path list goes away; the MCP endpoint, which is not a route, is protected with
`server.mcp: { auth: "required" }`, checked before any tool runs with the same memoized session. Function `access` rules run in
the engine for every invocation source, read the memoized session and the organization role, and are
recorded in the graph and OpenAPI. Runtime-handle calls run as a `system` principal that passes access
rules; `relkit.as(session)` swaps in a user principal.

`defineBetterAuthService({ auth })` takes the application's Better Auth instance. At activation
RelKit rebuilds the served instance from `auth.options`, adding the default Drizzle adapter when
`database` is absent and the base path when unset, and mounts it at `basePath` unless `mount: false`.
Without a database, Better Auth 1.7.1 falls back to an in-memory adapter, so importing the file during
`check` stays offline; a test confirms that no timers or sockets open.

Decided while applying section 18 (maintainer, 2026-11-05):

- **One check in the engine.** `defineFunction({ access: { roles, permissions, allow } })` is checked
  in the engine's `runHandler`, after input validation and context creation and before `onBefore`
  and the handler, so every source that reaches a handler (HTTP, jobs, tasks, event deliveries,
  tools, agent tool calls, MCP and the runtime handle) goes through the same check. Every part that
  is set must pass: at least one of `roles`, every `resource:action` permission, and `allow`
  returning true over `{ principal, session, input }`.
- **The caller is a principal.** An invocation carries a lazy, memoized principal: `system`,
  `anonymous`, or `user` with `session`, `roles` and `hasPermission`. A caller can pass one
  explicitly; otherwise a call inherits its parent's (through `ctx.functions`, agent tool calls and
  the dispatcher), runtime-handle calls are `system`, and anything else reads the handler context's
  `auth.getSession()`. The generated server builds the principal from the request's memoized
  session, so route auth, middleware, access rules and `ctx.auth` share one lookup.
- **Two built-in failures.** A denial raises `access-denied` (403) for a signed-in caller and
  `unauthenticated` (401) without a session. They are application failures with those codes that no
  function declares; declared-error validation lets them through, HTTP answers them as Problem
  Details, MCP returns the code as the tool error, and other callers receive the coded failure.
- **Background work has no user.** Job runs, task runs and event deliveries carry no session, so a
  function with an access rule that they call fails with `unauthenticated` unless its `allow`
  accepts anonymous callers. Background code that should act as the application calls
  `getRelkit()` (system); code that should act as a user calls `relkit.as(session)`. Carrying the
  enqueuing user's session through durable queues is not part of section 18.
- **Protection is projected, not re-derived.** The graph records a function's rule as
  `access: { roles, permissions, predicate: true }`; predicates are not serialized. OpenAPI adds a
  `session` apiKey cookie scheme (`better-auth.session_token`) and `security: [{ session: [] }]` to
  operations whose route requires a session or whose function has an access rule, with 401 and 403
  problem responses. The Inspector reads the same graph fields in its graph and route views.
- **Typed middleware provides by field.** `defineMiddleware(path, { provides, handler })` gives the
  handler `relkit.provide(data)`, which validates the data against `provides` (a failure is a 500,
  because the server produced it) and stores it on the request. `http.from(middleware, field)` is a
  serializable `{ kind: "middleware", name }` mapping typed from the middleware's schema; the
  runtime reads the field from the request, the function's input schema validates it again, and
  the client generator and OpenAPI leave it out. The mapping names the field, not the middleware's
  source-derived ID, so a route reads whichever typed middleware on its path provided it.
  `defineMiddleware(path, handler)` keeps the Hono signature.
- **Several databases need one default.** `defineDrizzleService({ default: true })` marks the
  service that `ctx.database`, the handle's `database` and Better Auth use. One service is the
  default without the flag; with several, check requires exactly one flag. The generated server
  activates every Drizzle service and fills `ctx.databases` and the handle's `databases` with all of
  them. Migrations and `relkit db` commands still act on the default service; per-service migration
  tooling is a follow-up.
- **`relkit.as(session)`** returns a handle of the same shape whose function calls run as that
  session's user. The trace source stays `system`; the principal is the user's.

### D13. Effect boundary (#14)

The `relkit` root re-exports only Promise APIs; `relkit/effect` re-exports the Effect helpers (for
example `failEffect`, context as an Effect service, test layers). The declaration scanner is tightened
again for the root entry. Generated `runtime-integrations.ts` moves its Effect usage into `relkit`'s
runtime, so applications no longer depend on `effect` directly. Handler result types keep accepting
Effects.

Decided while applying section 9 (maintainer choice, 2026-11-04):

- The root is a curated list, not a filtered `export *`. `packages/relkit/src/index.ts` names each
  export: the `define*` functions, `fail`, `streamOf`, `http`, `env`, `DeclaredError`, and the
  option, descriptor, context and client types an application writes against (115 names). A name
  belongs in the root only if an application uses it and it is Promise-based; runtime internals,
  validators, protocol records and telemetry stay on their `relkit/<area>` subpath, which keeps
  exporting everything it exported before. An export-list snapshot test records the root, so
  adding a name is a reviewed change. The 1,090 names that leave the root stay importable from a
  subpath; the constants, prompt and context-resolver names that only the root exported move to
  `relkit/config` and `relkit/host`.
- `relkit/effect` holds the Effect form of each root API: `failEffect`, `streamOfEffect`,
  `httpEffects`, the `define*Effect` functions, and `callToolEffect` and `callGraphNodeEffect`,
  which replace the `invokeEffect` members that public descriptor types drop. Internal Effect
  helpers stay on their area subpath. A handler-context Effect service and test layers do not
  exist yet and are not part of section 9.
- `failEffect` fails the Effect with the declared error. It used to succeed with a
  `FunctionFailure` wrapper, which an Effect handler's type check rejects.
- Measured before the change: the root had 1,205 exports, 368 of which reached a type declared in
  `effect`. Among the curated names only three causes leaked: `InspectorConfig` derived from an
  Effect Schema type (`defineApp`), and the `invokeEffect` member on tool descriptors
  (`defineFunction` through its tool view, and `defineTool`). Section 9.2 removes them and adds a
  walk of the root's exported types, and of the types generated registry declarations name, to the
  declaration scan. Since section 7 the root's file-based scan had covered every area under
  `dist/`, including internal ones that were never scanned as packages; it now covers `dist/app`,
  and each public area stays its own entry.

### D14. Dependencies and runtime handle (#15)

`dependencies` gains `functions`, `events`, `channels` and `databases`, and the compiler builds call
edges from them; `publishes` and descriptor `.invoke()` and `.trigger()` go away. `getRelkit()` reads
the active application from asynchronous invocation context and never from a process global.
`createRelkit(config)` runs the same activation as `relkit start` minus listeners and workers, and
`close()` disposes it. Inspector traces mark these calls with source `system`. The ID rule adds
errors to the descriptors that require explicit IDs; the codemod writes the previously inferred ID so
public error codes do not change.

Decisions taken during section 10 (maintainer, 2026-11-04):

- **Repository code moves by hand.** Each section 10 task rewrites the repository's examples,
  templates and bundled skill docs to the remaining form, so build, check, typecheck and the
  generator suite stay green. Section 12 still builds and fixture-tests a `relkit migrate` rule for
  every removed form; task 12.3 then finds nothing left for these rules in the repository.
- **The default database needs no declaration.** `ctx.database` keeps referring to the default
  Drizzle service. Declaring `dependencies.databases: { analytics }` adds `ctx.databases.analytics`
  and a `uses-database` edge; task 18.6 adds the typing for several Drizzle services. Channels get a
  `triggers-channel` edge. Database integrations map a service descriptor to its handler context
  through the `Relkit.DatabaseContexts` interface, so `relkit` stays free of Drizzle types.
- **Handle keys follow services and IDs.** The runtime handle groups functions, events, tasks and
  jobs by service and member name (`relkit.functions.orders.priceOrder`), keys buckets, caches,
  channels and agents by their explicit ID, and exposes the default database as `database` and every
  Drizzle service as `databases.<service>`.
- **`server.onStart` is the startup hook.** RelKit had no application startup hook, so
  `defineApp({ server: { onStart } })` runs once after providers are ready and before the server
  accepts requests, inside the handle's context so `getRelkit()` works there.
- **Task 10.3 lands before 10.2.** Commerce's order middleware calls a function outside any
  handler, so it needs `getRelkit()` before descriptor `.invoke()` can go.
- **`createRelkit` loads the built server.** The generated `.relkit/build/server/index.js` exports
  `activateRelkitApplication(mode)` and runs it itself only as the entry point. `createRelkit(config,
{ root })` calls it with `{ embedded: true }`, which skips the HTTP listener, `onStart`, event
  consumers, job workers and signal handlers and returns the handle with `close()`. Scripts need a
  prior `relkit build`; a missing or older build fails with `RELKIT_APPLICATION_BUILD_UNAVAILABLE`.
- **Handles are isolated except for realtime.** Each `createRelkit` call activates its own
  runtime, registry and providers, and a test runs two applications concurrently in one process.
  The realtime dispatcher is still set process-wide by `setActiveRealtimeDispatcher`, so two
  handles that both trigger channels share the last one set; moving it into invocation context is
  a follow-up.
- **The second `defineAgent` goes in section 24.** `@relkit/langchain`'s `defineAgent` is the one
  agents use today, and its replacement (`defineAgent` from `relkit` with a `runtime: langchain()`
  adapter) is built in tasks 24.2 and 24.3, so task 24.3 removes it. Task 10.8 removes the other
  duplicates.
- **The schema builder keeps `void()`.** RelKit code, templates and docs use `void()` for "no
  result" outputs, so `undefined()` goes. `defineTransform` stays and `defineRequestTransform` goes;
  `toJsonSchema` goes and `getJsonSchema` stays; `defineApp` keeps the `jobs` provider key and jobs
  keep `service` instead of `profile`.
- **Only function descriptors lose `.invoke()`.** Tool descriptors and function graph nodes keep
  their `invoke` adapter, because agent adapters such as LangChain call it.

### D15. Typed client (#16)

The generator emits an `api` object that mirrors services and routes; hooks take its properties. The
error type is a union keyed by `code`. The browser build uses no Effect runtime. In development the
backend publishes contract changes over its existing development channel, and the client reloads its
registry without a frontend restart. The switch from `/rpc` to REST comes later and only changes the
client's transport: evaluate oRPC's OpenAPI-based link against the needs for dates, large integers,
files and streams before writing a custom fetch layer, and move off the oRPC 2.0 beta under the
dependency policy.

### D16. Agent adapters (#22)

The adapter interface covers run, stream, resume and stop; tool calls bridged to the common engine;
model resolution from profiles; state persistence hooks; and AG-UI event mapping. The LangChain
integration becomes the first adapter, keeping its native options under `langchain({ ... })`. The AI
SDK adapter follows. One conformance suite runs against both.

Decided while applying section 24 (maintainer, 2026-11-05):

- **The interface is its own Labs area, `relkit/agent-adapters`.** Core areas may not carry
  `@experimental`, so the adapter types, `defineAgentRuntime`, the tool bridge
  (`createAgentToolBridge`), the shared loop (`createAgentAdapterRuntime`) and the AG-UI mapping
  (`agUiEvents`) live there and `relkit.labs` lists the area. `relkit/agents` stays Core;
  `defineAgent` only references the area's types. The conformance suite is
  `@relkit/testing/agents-conformance` (Core package, no `@experimental` tags).
- **An adapter has two halves.** The authoring value (`langchain()`, `aiSdk()`) is data plus an
  optional `extend` hook that adds the adapter's descriptor fields; it loads no SDK. The runtime half
  (`langchainAgentRuntime`, `aiSdkAgentRuntime`) is exported from the adapter's `./runtime` entry and
  supplies one model turn; RelKit's shared loop owns run, stream, resume, stop, threads, approvals,
  limits, traces and stream frames, so both adapters behave the same by construction.
- **Native options live only inside the adapter value**, which is how they tie an agent to the
  adapter: `defineAgent` rejects `middleware`, `checkpointer`, `store`, `subagents`, `skills`,
  `memory`, `backend` and `interruptOn` beside the portable fields, rejects non-string `model`, and
  accepts only RelKit tool references in `tools`. Client state keys contributed by middleware type-
  and value-check only under `langchain()`. Switching `runtime` drops the native options, and whatever
  depended on them (client state keys, native tools) then fails at definition or check time.
  `nativeOptions` on the descriptor and graph node records which ones an agent used.
- **`model` names a model profile.** The `model` capability profiles in `defineApp({ model })`
  already existed; `@relkit/langchain` adds the first-party `langchainModel({ model: "openai:gpt-5" })`
  provider (registration `model`/`langchain-model`). A selector `default:gpt-5-mini` keeps the
  profile's provider and overrides the model name. Native model instances, such as the offline
  `FakeToolCallingModel` in the agent template, move into `langchain({ model })`.
- **The compiler selects each agent's adapter integration.** The agent graph node gains
  `runtime: { integrationId, adapterId, protocolVersion, nativeOptions }`; runtime requirements add
  `agent-execution` for that integration (graph workflows, which have no `runtime`, stay on
  LangChain), and the generated server imports `@relkit/<integrationId>/runtime` only for
  integrations some agent selects. An adapter runtime entry exports `invokeAgentFunction`,
  `assertAgentRuntimeDependencies`, `releaseAgentPersistence` and `createGeneratedAgentFunction`.
- **Access rules plug in at the bridge.** `createAgentToolBridge({ access })` calls the engine's
  `AgentAccessCheck` with `{ source: "agent", agentId, toolId, functionId, input, principal }` before
  every tool call and reports a denial to the model; section 18 supplies the check.
- **Exact `defineAgent` shapes for the section 12 codemod.** Before:

  ```ts
  import { defineAgent } from "@relkit/langchain";
  export default defineAgent({
    id, input, output, instructions, limits, stateProfile, client, chat, controls,
    model: <native model, factory or "profile">,
    tools: [<RelKit tools and LangChain tools>],
    middleware, checkpointer, store, subagents, skills, memory, backend, interruptOn,
  });
  ```

  After:

  ```ts
  import { defineAgent } from "@relkit/app/agents"; // or "relkit/agents"
  import { langchain } from "@relkit/langchain";
  export default defineAgent({
    id,
    runtime: langchain({
      model: <native model or factory>, // only when it is not a string
      tools: [<LangChain tools>],
      middleware, checkpointer, store, subagents, skills, memory, backend, interruptOn,
    }),
    input, output, instructions, limits, stateProfile, client, chat, controls,
    model: "<profile>", // only when it was a string
    tools: [<RelKit tools>],
  });
  ```

  Every option keeps its value; `runtime: langchain()` is added when no native option is present,
  and `defineAgentEffect` moves to `relkit/agents` the same way. Repository call sites were moved by
  hand for this section; RelKit and LangChain tools in one `tools` array can only be told apart by
  their type, so the codemod should report mixed arrays it cannot split.

- **Bundled skill references keep the old example for now.** Every template's
  `.agents/skills/relkit/references/agent-apis.md` must equal the minimal template's copy, whose bytes
  are pinned to the measured creation evidence for 0.8.8; the update waits for the next measured
  creation run.

### D17. relkit mcp (#18)

`relkit mcp` is a stdio MCP server that discovers the running session through the existing private
descriptors under `.relkit/connections` and calls the Inspector API with that session's token. Its
tools wrap Inspector API endpoints and the CLI's `check` and `add` transactions. Production builds
exclude it by construction because it lives in `@relkit/cli`. The application's `/mcp` endpoint
evaluates MCP elicitation for approval-required tools and otherwise returns an actionable coded error.

Decided while applying section 19 (maintainer, 2026-11-05):

- The Inspector API reference is generated from a real router installation:
  `inspectorApiReference()` in `relkit/inspector-api` installs the endpoints on a throwaway Hono
  app and reads its registered routes, then adds the bridge's own endpoints
  (`INSPECTION_BRIDGE_ENDPOINTS`, now also used by the bridge handler). The docs page
  `/docs/api/inspector-protocol` is generated from it, and a docs test checks that every
  advertised path and bridge endpoint has a row with its version and authentication. Paths are
  versioned `v1` (`x-relkit-api-version: 1`); bridge endpoints are protocol 1. History endpoints
  (logs, requests, traces, stream) are documented as served by the Inspector, because the bridge
  refuses them.
- `relkit mcp` discovers sessions itself instead of depending on `@relkit/inspector`: it reads
  `.relkit/connections` through `InspectionFiles`, keeps descriptors of the same project whose
  handshake proves the same project and session, and fails with `RELKIT_MCP_NO_SESSION` (none) or
  `RELKIT_MCP_SESSION_AMBIGUOUS` (several) before writing any MCP output. It uses
  `@modelcontextprotocol/server` 2.3.0, now a dependency of `@relkit/cli`, loaded only when the
  `mcp` command runs.
- A request's logs and trace come from the bridge's record buffer: `relkit mcp` is a named
  collector (`x-relkit-inspection-consumer: relkit-mcp-<uuid>`) that acknowledges what it reads,
  so it never releases records the Inspector has not stored. It sees what the session still
  buffers when it starts plus every later record; it does not read the Inspector's DuckDB
  history.
- `check` and `add` run this CLI as a child process with `--json` and no terminal. `add` keeps
  its existing transaction, so "transactional add" means the add command's own rollback; the MCP
  tool refuses `--json` and `--project-root` in `options`.
- Elicitation on `/mcp` is not used yet. The endpoint creates a stateless server per HTTP request,
  so a tool call cannot stay open while the client answers an elicitation request on a later
  request; the stateless input-request flow in the 2.3 SDK is not supported by the clients we
  test. An approval-required tool returns `RELKIT_MCP_APPROVAL_REQUIRED` (text and structured
  content with the docs link) and does not run. Revisit when `/mcp` keeps sessions.
- The Inspector action API gains `job.trigger`, `event.publish` and `event.replay`
  (`/actions/jobs/:id/trigger`, `/actions/events/:id/publish`, `/actions/events/:id/replay`),
  dispatched to optional `trigger`, `publish` and `replay` methods on the existing jobs and events
  action services. A generation without them answers `RELKIT_INSPECTOR_ACTION_UNSUPPORTED`, as
  retry and cancel already did.
- The generated development server does not wire `trigger`, `publish` or `replay` yet: the jobs
  controls it builds have no start operation, and replaying needs a publication's payload, which
  the event providers do not keep. Until the host wires them, these actions answer
  `RELKIT_INSPECTOR_ACTION_UNSUPPORTED` in a real application and the Inspector shows that code;
  the browser tests drive them against the Inspector fixture. This is a follow-up for the jobs
  and events owners.
- `function.invoke` now generates a W3C trace ID, passes it to the invocation (the generated host
  forwards it to the engine) and returns it beside the output, so the Inspector's MCP tools page
  opens the call's trace. The page calls a tool by invoking its target function through the
  action API; tools whose approval policy needs a person stay disabled there, matching `/mcp`.
- Agent evaluations need a model to run, which costs money, so CI does not start agents. The
  release-readiness `agent-evals` job runs the deterministic skill packaging check and computes
  the pass rate from the graded runs in `tests/agent-evals/results` (each now has a `verdict`); a
  run passes only when both its semantic review and its technical checks pass. The rate is a job
  output and the `agent-eval-pass-rate` output of the release-readiness workflow, ready for the
  metrics page in section 20.

### D18. Governance and plain language (#3, #5, #7, #8, stop-doing)

- A writing guide plus checks: a spelling check for the product name, a banned-term check for user
  text, and docs generation that fails when a `RELKIT_*` code has no page.
- Evidence moves to workflow artifacts (90-day retention) and release assets. A size check keeps
  `docs/` under 5 MB, and a path check rejects machine-specific paths outside an allowlist.
- `docs/dependencies.md` lists pre-release pins with owners and exit plans, and a check compares it
  with the lockfile.
- The stop-doing rules are recorded in CONTRIBUTING and enforced in review.

### D19. Metrics and launch (#21)

A release workflow gathers the plan's metrics from CI (creation canary, runtime matrix, benchmarks,
agent evals, Railway deploy test) and publishes a metrics page; newcomer timings come from a scripted
walkthrough. The launch checklist reads the same page.

### D20. Findings follow-ups (plan section 8.5)

Decided while applying section 27 (maintainer, 2026-11-05):

- **Template `start`.** Every template runs `relkit start`. The direct JavaScript command stays
  documented for a production root that has no CLI installed (the AWS guide).
- **Fresh clones type-check because the two generated type files are committed.** The template
  `tsconfig.json` lists `.relkit/generated/route-module-checks.ts` and
  `.relkit/generated/context-registry.d.ts` under `files` (the fullstack web project also reads
  `client-registry.d.ts`), and `.gitignore` excluded all of `.relkit/`, so a clone failed with TS6053. The templates' `.gitignore` now ignores everything under
  `.relkit/` except those files (three for fullstack), which are deterministic, contain no machine paths and are
  refreshed by `relkit check` and `relkit dev`. This keeps the `tsconfig.json` shape that the
  development snapshot's eligibility schema audits, and keeps typed `context` on a fresh clone,
  which a tolerant `include` would lose. The proof is `scripts/fresh-clone-typecheck.ts`: it creates
  a project from the packed candidate, commits it, clones the commit, installs and runs the
  `typecheck` script. The CI job lives in `checks.yml` (the workflow named CI, which runs on pull
  requests), not in `ci.yml`, which is the release workflow that runs only after main. It runs for
  every template whenever creation, templates or the script change, and `ci-gate` requires it.
- **`relkit check` is documented as running top-level code.** The CLI page lists what the
  evaluator child blocks (listening sockets, child processes, unapproved network, writes outside the
  generated directory, live timers, direct output), states that the child gets an empty environment
  and a 10 second deadline, and says plainly that it is an accident guard, not a sandbox.
  `relkit.config.ts` runs unguarded in the CLI process. The allowlists and the deadline are options
  of the programmatic check, not CLI flags.
- **Delivery semantics are documented from the code.** Durable event and job delivery is at least
  once. The local jobs provider moves `running` runs back to `queued` when its journal opens, and an
  expired queue lease (30 s) frees an entry. The ephemeral event "queue" is a concurrency gate with
  capacity 100 per event function and no backlog: the newest event is dropped and reported as
  `status: "dropped"`, `dropReason: "capacity"`. The scaffold flag says `transient` while
  `defineEventFunction` accepts `ephemeral`; the docs name both and the mismatch is left for the
  scaffolding owner.
- **API reference curation moves entries, it does not copy them.** Each generated page leads with
  its most-used APIs (the names in the feature catalog), including their examples, under "Most-used
  APIs", followed by "Complete reference" with the export table and the file-ordered entries. An
  entry that appears under several files moves once, preferring the one with an example, so heading
  anchors stay unique and links keep working.
- **Typed test HTTP client.** `TestHttpRequest` takes `<Body = unknown, Json = unknown>`: `Body` types
  `response.json()` and `Json` types a new `json` request shorthand that serializes the body and
  sets the content type. The default is `unknown`, not `any`, so a test narrows before reading
  fields. The type is a declaration; the harness does not validate it. `TestProblemResponse` types
  the Problem Details body. Deriving bodies from route declarations is left until the client's call
  style (D15) settles.
- **OpenTelemetry semantic conventions and metrics.** Findings: spans already use `http.route`,
  `http.response.status_code`, `error.type` and `code.function.name`, with `relkit.*` for the rest;
  they lack `http.request.method`, `url.*` and `server.*`, and jobs, events, databases and agents
  carry no `messaging.*`, `db.*` or `gen_ai.*` attributes. Internal Effect metrics use Prometheus-style
  names (`relkit_observability_*_total`) and nothing exports them; the OTLP exporter sends traces
  and logs only.
  - Adopt the stable HTTP semantic conventions for request spans and metrics now. Keep `relkit.*`
    attributes next to them. Adopt `messaging.*`, `db.*` and `gen_ai.*` only once the matching
    conventions are stable.
  - Export metrics over OTLP/HTTP JSON from the existing exporter, without the OpenTelemetry SDK. The
    exporter already owns batching, retries, redaction and the dependency budget, and the SDK would
    add a large dependency tree to a Labs package. The first metric is
    `http.server.request.duration`, a histogram in seconds with the semantic-convention bucket
    bounds, cumulative temporality, grouped by method, route, status code and error type.
  - Count metrics from every completed request record before trace sampling, so sampling does not
    skew them. The exporter must therefore receive records ahead of the sampler, or a separate
    aggregator must; that wiring is future work in `packages/relkit/src/observability`.
  - The spike in `integrations/packages/otlp/metrics-spike.test.ts` aggregates request records into
    that histogram and posts it to an in-process OTLP/HTTP receiver. It checks the path
    (`/v1/metrics`), the payload shape, the bucket counts, the attributes, and that unfinished
    requests are skipped. It does not change the exporter's public API.

## Risks / Trade-offs

- [The breaking release is large and could stall other work] → Publish a beta first; keep additive
  changes independent; phase 2 has six weeks.
- [The codemod misses patterns] → Run it on every repository example and template in CI; list what
  it cannot change with file and line.
- [In-process handler swapping leaves stale state] → Swap only when configuration, providers and
  route shape are unchanged; otherwise restart; test both paths.
- [Third-party projections change across library versions] → Canonicalize the JSON and fingerprint
  library versions so changes are visible.
- [The runtime matrix makes CI slow] → Tier 1 runs on every pull request, Tier 2 nightly.
- [Workers lacks a filesystem and long-lived processes] → Tier 2 is HTTP-only with external backends;
  `relkit check` names unsupported providers.
- [The Postgres backend is complex] → Wrap a proven library if it passes conformance; fault-injection
  tests cover crashes and duplicate delivery.
- [Importing a Better Auth file during `check` could open resources] → Test for timers and sockets;
  fall back to lazy import if a future Better Auth version opens them.
- [The `system` principal could bypass access rules unintentionally] → Only the runtime handle runs
  as `system`; HTTP, tools, agents and MCP always carry the caller's principal; tests cover each
  source.
- [`relkit mcp` exposes powerful actions] → Localhost only, token-authenticated, development only,
  and `add` runs as a transaction with rollback.
- [Moving off package boundaries weakens internal layering] → Boundary and konsistent checks run in
  `prepush` and CI.
- [Archive conflicts with the in-flight lean-installation change] → Archive this change after it, and
  rebase these deltas if its text changes again.

## Migration Plan

**Verification rule:** every task is verified on its pull request, before it merges, by local runs
or CI runs against packages packed from that pull request. No task may need a merge to `main`, a
published release or a workflow run from `main` to be verified; publishing and announcing are
release steps after the change merges.

1. **Phase 1 (weeks 1–2):** groups 1–5. These changes are additive except the builder rename, which
   ships in the breaking release.
2. **Phase 2 (weeks 3–8):** groups 6–13 on a release branch: packaging, errors, Better Auth file,
   Effect boundary, dependency model and runtime handle, client call style, `relkit migrate`, and the
   first benchmarks. Migrate examples and templates with the codemod and rehearse `0.9.0-beta` from
   packed packages on the release-branch pull request. After the change merges, publish `0.9.0-beta`,
   fix issues, then publish `0.9.0` and the deprecated final `@relkit/app`.
3. **Phase 3 (weeks 9–14):** groups 14–19: Node, TypeScript 7, Postgres backend, production image and
   Railway, access rules and typed middleware, `relkit mcp` and Inspector actions, incremental reload.
4. **Launch:** group 20 when the P0 items and the Railway newcomer test pass.
5. **Next quarter:** groups 21–26: Vercel, Workers and Cloudflare, REST transport, agent adapters,
   provider kit, stability policy and 1.0.

**Rollback:** until `0.9.0` is final, users stay on 0.8.x and the beta channel can be abandoned. After
`0.9.0`, fixes ship as patch releases; `relkit migrate` keeps a rollback receipt for each project it
changes.

## Open Questions

- The exact tool names and payload shapes of `relkit mcp`.
- Whether to wrap an existing Postgres queue library or build in-house; the conformance suites decide
  either way.
- Which CI host publishes the benchmark numbers.
- The final version number of the breaking release; 0.9.0 is assumed.

## Plan coverage

Every item in the plan maps to specs and tasks:

| Plan item                         | Capabilities                                                                                      | Task groups        |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| #1 Creation on current Bun        | cli-scaffolding, acceptance-verification, user-facing-text                                        | 1, 28              |
| #2 Why RelKit and positioning     | developer-documentation                                                                           | 2                  |
| #3 Plain language                 | user-facing-text, developer-documentation                                                         | 3                  |
| #4 Any Standard Schema validator  | public-authoring, compiler-graph, cli-scaffolding                                                 | 4, 12              |
| #5 Core and Labs                  | release-stability, developer-documentation, project-governance                                    | 5                  |
| #6 Packages and one version       | package-distribution, workspace-foundation, cli-scaffolding, release-stability                    | 7, 12              |
| #7 Process and repository hygiene | project-governance                                                                                | 6                  |
| #8 Pre-release dependency policy  | project-governance                                                                                | 6, 23              |
| #9 Development loop               | development-loop, compiler-graph, cli-scaffolding, acceptance-verification                        | 13                 |
| #10 Runtimes                      | runtime-portability, acceptance-verification                                                      | 14, 22             |
| #11 TypeScript 7                  | typescript-compatibility, workspace-foundation, acceptance-verification                           | 15                 |
| #12 Production and deploy targets | deployment-targets, durable-postgres-backend, jobs-events, pulumi-aws-deployment, cli-scaffolding | 16, 17, 21, 22     |
| #13 HTTP and auth model           | http-runtime, public-authoring, function-runtime, domain-services, access-control                 | 8, 18              |
| #14 Effect boundary               | public-authoring, function-runtime                                                                | 9                  |
| #15 One way and runtime handle    | public-authoring, function-runtime, compiler-graph, domain-services, jobs-events, runtime-handle  | 10                 |
| #16 Client and wire protocol      | http-runtime                                                                                      | 11, 23             |
| #17 Escape hatches                | Deferred (non-goal)                                                                               | Workflow follow-up |
| #18 relkit mcp                    | developer-mcp, development-inspector                                                              | 19                 |
| #19 Provider kit                  | provider-authoring-kit                                                                            | 25                 |
| #20 Stability policy and 1.0      | release-stability, developer-documentation                                                        | 12, 26             |
| #21 Community launch              | project-governance                                                                                | 20                 |
| #22 Agent adapters                | agent-adapters, tools-agents, ai-sdk-migration                                                    | 24                 |
| Stop-doing rules                  | project-governance, release-stability                                                             | 6                  |
| Metrics                           | project-governance, acceptance-verification, developer-mcp                                        | 1, 13, 20          |
| Additional findings               | developer-documentation, jobs-events, cli-scaffolding, development-inspector                      | 27                 |
| Inspector future                  | development-inspector                                                                             | 19                 |
