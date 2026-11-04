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

Decided while applying section 14 (maintainer, 2026-11-05):

- **Adapters live in `relkit/runtime`.** `relkit/runtime` holds the `RuntimeAdapter` contract
  (`serve`, `upgradeWebSocket`, `files`, `crypto`, `environment`, with `files` undefined for a
  runtime without a filesystem) and `currentRuntime()`, which picks the adapter from
  `process.versions.bun`. `relkit/runtime/bun` wraps `Bun.serve`, Hono's Bun WebSocket handler,
  `Bun.file` and `Bun.SHA256`; `relkit/runtime/node` uses `@hono/node-server` 2.x, whose built-in
  WebSocket support runs on `ws`, plus `fs.openAsBlob` and `node:crypto`. `relkit/runtime-hono/bun`
  goes away. The request path passes the adapter's per-request bindings through unchanged, static
  files open their bodies through `files`, and the inspector bridge listens through `serve`. The
  generated server imports the selected adapter as `relkitRuntime`. Node's listener has no body
  limit of its own, so RelKit's `maxBodyBytes` middleware alone limits bodies there.

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

### D17. relkit mcp (#18)

`relkit mcp` is a stdio MCP server that discovers the running session through the existing private
descriptors under `.relkit/connections` and calls the Inspector API with that session's token. Its
tools wrap Inspector API endpoints and the CLI's `check` and `add` transactions. Production builds
exclude it by construction because it lives in `@relkit/cli`. The application's `/mcp` endpoint
evaluates MCP elicitation for approval-required tools and otherwise returns an actionable coded error.

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
