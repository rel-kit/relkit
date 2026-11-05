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

Decided while applying section 12 (maintainer, 2026-11-05):

- **`relkit migrate` is the code migration; `layout` stays a subcommand.** `relkit migrate` previews,
  `--write` applies and `--rollback <record>` undoes; `relkit migrate layout` is unchanged. A code
  record is told apart from a layout record by `kind: "code"`, may list created files (no `before`),
  and rollback deletes a created file only while it still holds the migrated bytes. Write refuses a
  touched file with uncommitted Git changes and restores automatically when publication fails. The
  codes are `RELKIT_MIGRATE_*` in their own registry file, because `cli.ts` may only shrink.
- **One rule per breaking change, pure and fixture-tested.** Eleven rules in
  `packages/cli/src/migration/code-rules/` run in a fixed order (`package-imports` first,
  `schema-builder` last): `package-imports`, `legacy-jobs`, `removed-aliases`, `error-ids`,
  `dependency-declarations`, `context-calls`, `service-routes`, `better-auth-file`, `client-hooks`,
  `agent-runtime`, `schema-builder`. Each is a text transform over a syntax tree that keeps the
  bytes it does not change; fixtures are `.txt` pairs so 0.8 code never reaches the type checker or
  the formatter. Every TypeScript parse goes through `packages/cli/src/migration/code-parser.ts`, so
  swapping in the CLI's bundled TypeScript is a one-file change.
- **Rules rewrite only what syntax proves and report the rest with file and line.** `context-calls`
  rewrites receivers imported from `*.function` / `*.channel` modules, created by `defineFunction` /
  `defineChannel`, or members of an imported `service` module, because tools and graph nodes keep
  `invoke`; outside a handler only `<service>.<member>.invoke()` has a known handle path
  (`getRelkit().functions.<serviceId>.<member>`, the ID read from `defineService({ id })` or the
  service folder). `legacy-jobs` reports every function-target job instead of inventing a task, and
  rewrites only `ctx.jobs.<name>.enqueue` to `trigger`. `agent-runtime` splits `tools` only when
  every entry's import tells RelKit tools (`*.tool` modules, `defineTool`) from LangChain tools
  (`langchain`, `@langchain/*`, `deepagents`). `@relkit/app` root names outside the curated
  `relkit` root stay on `@relkit/app` and are reported.
- **Exact public codes for errors.** `error-ids` calls the compiler's own `encodeErrorId` with the
  file path and binding name, so the written ID equals the code 0.8 inferred; an error without a
  binding is reported.
- **Client hooks need the backend's contract.** `client-hooks` names `api` properties with
  `clientApiPaths` over the routes of `.relkit/generated/client-contract.json`, or the file passed
  with `--contract` (a separate frontend such as `examples/commerce-web` passes its backend's).
- **Guidance migrates too.** Rules marked `markdown` (imports, aliases, builder, service routes,
  client hooks, agent runtime) also rewrite TypeScript code fences in `.md` and `.mdx` files, so the
  bundled skill references move with the code. Rules that derive identities from file paths do not
  run on fences. Files under `migrations/` folders are never read, so applied migration history is
  untouched.
- **Samples were moved by `relkit migrate --write` alone.** On every template and example the rules
  that section 10 had already applied by hand found nothing; `package-imports`, `schema-builder`
  and `agent-runtime` (the bundled skill references' LangChain example) made every change, and a
  second preview reports nothing to migrate and no findings. Prettier then reformatted the five
  rewritten skill-reference fences, the only change not made by the codemod. This supersedes the
  section 24 note that the skill references keep the old example: the minimal template's digest in
  `create-capabilities.ts` is re-pinned as the test computes it. `relkit add` now writes `relkit`
  specifiers and the `s` builder, and the creator reads provider versions from the template's
  `relkit` dependency, because templates no longer depend on `@relkit/app`.
- **Every breaking changeset maps to a rule.** Four breaking changes had no rewritable syntax yet,
  so rules were added: `route-auth` moves the protected-path list onto matching route modules,
  `problem-details` reports reads of the old `error` field, `package-imports` maps
  `relkit/runtime-hono/bun`, and `removed-aliases` rewrites a tool's `invokeEffect`.
- **The guide's example is migrated by the CLI in the docs tests.** `/guides/migrate/relkit-0-9` has
  one section per rule, headed by the rule's `guide` anchor. Its 0.8 files live as text in
  `apps/docs/examples/migrate-0-9/before`; `apps/docs/tests/migrate-0-9.test.ts` runs the built
  `relkit migrate --write` over them and requires the Prettier-formatted output to equal the
  compiled 0.9 files in `examples/migrate-0-9/src` that the page includes, with no findings, then
  rolls back to the 0.8 bytes. `handle-registry.d.ts` stands in for the registry `relkit check`
  generates, so `getRelkit()` types there. Agent and client-hook snippets stay plain fences,
  because the docs package installs neither LangChain nor a generated client; their rules have
  fixture tests.
- **Changelog entries are the changesets.** `CHANGELOG.md` is written by `version-packages.ts` at
  versioning, so the 0.9 entries are the pending changesets: every breaking one now links its rule's
  guide section, and new breaking changesets cover the client hooks (section 11) and
  `defineAgent({ runtime })` (section 24), which had none, plus a New entry for `relkit migrate`.
- **A breaking change names its rule through its guide link (task 26.3).** Changesets frontmatter
  holds only package bumps, so `scripts/breaking-migrations.ts` reads the link instead: every
  changeset versioning would group under Breaking must link `/guides/migrate/<page>#<section>`,
  the section must exist in that guide page, and the anchor must be some rule's `guide` anchor.
  It runs in `bun run check`, which every pull request (the release pull request included) runs,
  next to the migration-link check `version-packages.ts` already applies, and
  `tests/unit/breaking-migrations.test.ts` shows it failing on a fixture.
- **The beta rehearsal publishes nothing and changes no repository file.** `scripts/rehearse-beta.ts`
  reads the next shared version from the pending changesets (the plan `version-packages.ts
--check` prints) and uses `<version>-beta.0`, builds and packs the release closure with the
  packing helper the creation smoke test uses, then rewrites each archive's manifests (its own,
  the creator's template manifests and provider catalog) to the beta version, as versioning and
  packing would. The existing candidate registry serves the archives, so nothing falls back to
  published first-party versions; a small front adds each deprecated package's message to its
  version metadata, which is what `npm deprecate` changes. Against it, the rehearsal creates
  projects with the packed `create-relkit` and runs their `check`, `typecheck`, `test` and
  `build`, serves the built minimal project on Bun and on Node, and turns a copy into a 0.8-style
  project on the final `@relkit/app` that must report the deprecation, build, migrate with the
  packed `relkit migrate` and build again. The release-readiness workflow, which runs on pull
  requests, runs it for the minimal, api and fullstack templates.
- **The deprecation lives in release configuration.** `scripts/release-deprecations.ts` holds the
  final `@relkit/app` message, which names `relkit` and the migration guide; after publishing and
  verifying a batch, `publish-release.ts` runs `npm deprecate` for each deprecated package in it.
  The package itself already re-exports `relkit` (section 7).

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

Decided while applying section 13 (maintainer, 2026-11-05):

- **Eviction, not query strings, gives a fresh module.** Bun keys ES modules by path, and importing
  `file.ts?v=2` still binds that module's static imports to the old dependency instances. The
  reloader (`relkit/host`, `createModuleReloader`) therefore tracks the application modules a
  process has loaded, finds the changed ones by modification stamp, adds every loaded module that
  imports them (from `Bun.Transpiler.scanImports`), and deletes all of them from Bun's module
  registry; the next import evaluates each of them again, and every other module keeps its
  instance. Descriptor dependents come from `invalidateWatchDependencies` over the previous
  compilation's watch index. Both the warm evaluator and the dev server use the reloader.
- **The warm evaluator is two warm processes.** The development checker (`dev-check-worker`) is
  now one persistent process per session instead of one per check, and it evaluates through one
  persistent evaluator child (`evaluator-warm-child`) that keeps the one-shot child's allowlisted
  environment and side-effect detectors. Unchanged candidates reuse their snapshot, relabelled
  with the current generation.
- **Service ownership tolerates a re-evaluated service.** A re-evaluated `service.ts` claims the
  unchanged function descriptors its previous instance owned. Each eviction advances a
  development evaluation epoch (shared through `globalThis`, because the evaluator and the
  application can load separate copies of `relkit`), and `bindDescriptorServiceMembers` lets a
  service replace an owner defined in an earlier epoch. Outside development the epoch stays 0 and
  the rule is unchanged.
- **What may be swapped.** A save is swapped in place only when no changed path is
  `relkit.config.ts`, under `src/platform`, `package.json`, a lockfile, `tsconfig.json`,
  `bunfig.toml`, a `.env` file or `node_modules`; when the new check's configuration, provider and
  local-service plans, jobs manifest, schema-library hash and graph shape (the graph with source
  positions removed) equal the serving generation's; and when, in the server, no manifest entry
  other than functions, targets, services and routes was re-evaluated (middleware, transforms,
  hooks, agents, tools, channels, tasks, jobs and the application are captured by the HTTP
  application and workers at startup). Anything else takes the blue/green path, reusing the
  check already done. Provider bindings live in `relkit.config.ts` and `src/platform`, so the
  restart test changes the configuration file.
- **The swap travels over the candidate's IPC channel.** Candidates are spawned with a Bun IPC
  channel; the CLI writes `runtime.manifest.v<N>.ts` and `application.graph.v<N>.json` next to
  the serving `index.ts` and sends `relkit.dev.reload`. The generated server installs the hook
  (`installDevelopmentReload`) only when `RELKIT_DEV_RELOAD=1` and not in production, and its
  function registry is a stable `createHandlerTable` registry whose table and manifest maps are
  replaced in one synchronous step. The change to the generated server is two lines in
  `build-server-application.ts` and one import in `build-server-imports.ts`, outside the HTTP
  serving files section 14 owns.
- **Development runs the generated TypeScript.** A development build skips `bun build` and links
  `effect` and `relkit` into the generation's `server/node_modules` (the links the bundler used
  to create temporarily), and the dev entrypoint is `server/index.ts`. The one exception is a
  generation with local Docker job workers (inngest, effect-mq, trigger): their containers run
  the generation's `server/index.js` with only the generation and `node_modules` mounted, so that
  generation is still bundled, and it is never swapped in place, because the workers would keep
  the old handlers.
- **Types report through the session log.** `tsc --watch` (or the project's `tsgo`) runs for the
  session; each finished pass is logged as `dev.typecheck.failed` with up to 20 diagnostics, or
  `dev.typecheck.passed`. The session log feeds both the terminal and the Inspector's log records,
  so no new Inspector protocol was added. Development checks, including the initial one, no
  longer type-check; `relkit check` and `relkit build` still do.
- **`relkit dev --prepare` is `relkit check`.** The CLI dispatches it to the check command, so it
  prints `Checked <root>` and exits non-zero with located diagnostics. create-relkit keeps
  running it during installed creation and keeps the `--no-install` next step
  `bunx --no-install relkit dev --prepare` between `bun install` and `bun run dev`; the
  snapshot-ineligible fallback is gone. `@relkit/cli/tooling` exports `contentDigest` in place of
  the snapshot exports, and the packed readiness probe always compares the served OpenAPI
  document.
- **Benchmarks measure process trees.** Peak memory is the largest summed resident set of the
  command and every process it starts, sampled every 20 ms with `ps`, for `relkit check` and for
  `tsc -p` over the same sources. The docs page renders the report named by
  `RELKIT_DEV_LOOP_REPORT` (release readiness sets it to its own run's report) or the checked-in
  `apps/docs/data/dev-loop-benchmarks.json` from a local run. The budget gate
  (`scripts/check-dev-loop-budgets.ts`) re-judges a report against the current budgets, so a
  fixture's stored verdict cannot pass it.

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
- **The portability check is a shrink-only baseline.** `scripts/portability.ts`, wired into
  `bun run check`, parses package sources and rejects `Bun.*` references, `bun`/`bun:*` imports and
  `node:` imports outside adapters. Adapters are files under a `bun/` or `node/` directory or named
  `*.bun.ts`/`*.node.ts`. `Bun.*` is checked in every package; `node:` is checked only in packages
  that run inside applications, because the CLI, the creator, `@relkit/testing` and the inspector
  tool only run on Tier 1 runtimes, where `node:` modules are portable. Call sites that existed when
  the check landed (the dev supervisor and snapshot code that section 13 rewrites, the CLI's
  subprocess and glob code, and the `node:` imports of `relkit` areas) are counted per file in
  `scripts/portability-baseline.json`; a file's count may only shrink, and
  `--update-baseline` only lowers counts.
- **`relkit build --runtime node` keeps Bun for installs.** The bundle targets Node and the server
  imports `relkit/runtime/node`; Node 22 has no `import.meta.main`, so the Node entry point compares
  `import.meta.url` with `process.argv[1]`. The Node Dockerfile is two-stage: the pinned Bun image
  runs `bun install --production`, which applies the selected `patchedDependencies` that npm does
  not support, and a pinned `node:24.22.0-bookworm-slim` image runs `node server/index.js` as the
  `node` user. `manifest.json` gains `"runtime": "node"` only for Node builds, so Bun builds stay
  byte-identical. `relkit dev` and `relkit start` still run on Bun.
- **The template's own HTTP tests check the production build.** `RELKIT_TEST_SERVER_URL` makes
  `createTestApplication` send `testApp.http` requests to a running server, adding the server's
  origin when a test sends none, because production servers reject unsafe requests without one.
  `scripts/runtime-http-suite.ts` packs the checkout, creates `api` from a local registry, runs
  `relkit build --runtime <bun|node>`, starts the server with the chosen executable and runs
  `bun test tests/integration` against it. The test runner stays Bun; the server under test is
  the one that changes runtime.
- **Integrations pick their client per runtime, at load time.** `@relkit/redis` sends every
  command through a small native-client interface: `Bun.RedisClient` on Bun (unchanged) and
  `ioredis` 5 on Node, both without retries or an offline queue. `@relkit/sentry` imports
  `@sentry/bun` or `@sentry/node`; the integration's dependency list names both (same version,
  and `@sentry/bun` already depends on `@sentry/node`), because the requirement schema has no
  runtime field yet. `@relkit/drizzle/sqlite` gains `openSqliteDatabase(path)`, which uses
  `bun:sqlite` on Bun and `node:sqlite` on Node; `node:sqlite` is unflagged from Node 22.13 and
  prints an experimental warning on Node 22 and 24. Conformance modules are plain JavaScript that
  import the built packages, so the same file runs under `bun` and `node`; Redis runs against a
  Docker Redis behind `RELKIT_TEST_DOCKER=1`.
- **Not moved in section 14:** `relkit add database --dialect sqlite` still writes a `bun:sqlite`
  service, because the dev snapshot import policy that section 13 removes allow-lists exactly
  those imports; switching the scaffold to `openSqliteDatabase` is a follow-up once that lands.
  The AWS Valkey client (`@relkit/aws`) still imports `RedisClient` from `bun` and stays Bun-only.
- **`engines` comes from one table.** `scripts/package-engines.ts` gives every published package
  `bun: ">=1.3.10"` and, unless it is listed as Bun-only, `node: ">=22.13.0"` (the first Node 22
  with `node:sqlite` unflagged); release sync writes it and the release check compares it. The
  Bun-only list names its reason: `@relkit/cli` and `create-relkit` until task 14.5's work lands
  everywhere they spawn and serve, `@relkit/testing` for its in-process transpiler, and
  `@relkit/aws` for its Valkey client. A unit test fails when a Bun-only package has no Bun call
  site left in the portability baseline, so the list cannot outlive its reason. The inspector keeps
  its Next.js range, `node: ">=20.9.0"`. `@relkit/docker` moved to `node:child_process` so it can
  list Node.
- **The runtime matrix gates merges through the CI Gate.** The `runtime-http` job runs the
  adapter test and the `api` HTTP suite on Bun 1.3.10, Node 22 and Node 24, and the Node legs also
  run the Redis, Sentry and SQLite conformance runners (each spawns both runtimes). The CI Gate
  requires the job's result to be `success`, and a unit test runs the gate's shell step with that
  result set to `failure`, `cancelled` or `skipped` to show each one blocks. The nightly creation
  canary gains a `node-canary` job for every template on Node 22 and 24: it creates with the
  published creator, builds with `--runtime node` and serves on Node until liveness answers. Until
  a release ships `relkit build --runtime`, that job notes the missing option and passes.
- **Task 14.5 stays open.** The creator and the CLI still need Bun: `create-relkit` installs with
  `bun install` (its output schema names that command) and writes Bun scripts and
  `packageManager: bun@1.3.10` into templates; the `relkit` launcher runs the CLI under Bun; the
  compiler's evaluator and the dev supervisor spawn, serve and evaluate TypeScript through Bun; and
  `relkit build` bundles with `bun build`. The evaluator and supervisor are being rewritten in
  section 13, so moving them waits for that work. Running the CLI on Node also needs a TypeScript
  loader for application sources and another bundler. The production server already runs on
  Node through `relkit build --runtime node`.
- **Docs:** `/docs/modules/deployment/runtimes` lists the tiers, the Bun-only packages, building,
  running and testing on Node, the Node container image and the per-runtime integration clients.

Decided while applying section 14 (task 14.5, maintainer, 2026-11-05):

- **The adapter grows `processes` and `modules`.** `RuntimeAdapter` gains `processes` (`spawn`
  with pipes, an optional IPC channel and an abort signal; `which`) and `modules` (`resolve`, and
  `registry`, the evictable module registry). Bun wraps `Bun.spawn`, `Bun.which`,
  `Bun.resolveSync` and `require.cache` with `Bun.Transpiler.scanImports`; Node uses
  `node:child_process` with the structured-clone IPC serialization Bun's channel uses,
  `Readable.toWeb` streams, a `PATH` search, and `require.resolve` with a fallback that reads a
  package's `exports` map for import-only packages, including a package importing its own
  subpaths. Node has no `registry`: its ES module cache
  cannot drop an evaluated module. `createModuleReloader(projectRoot, modules)` takes the
  adapter's modules, and the dev reload hook loads the adapter itself.
- **Node runs application TypeScript through the CLI's module hooks.** `@relkit/cli` depends on
  esbuild 0.28 (a dependency of the CLI only, which applications list as a dev dependency).
  `src/runtime/node/typescript-hooks.ts` transpiles `.ts`/`.tsx`/`.mts` with esbuild's
  `transform` (types removed, nothing checked), resolves a `.js` specifier that names a
  TypeScript file, extensionless relative imports and the nearest `tsconfig.json` `paths`
  (following a relative `extends`), and passes the JSX and decorator options through. Every Node
  child that evaluates sources (the one-shot evaluator, the dev check worker, candidate servers,
  the migration worker) starts with `--import` of the register module, and the CLI's own Node
  process registers it before loading `relkit.config.ts`. Node 22.13 has neither unflagged type
  stripping nor `paths`, so Node's own type stripping is not used.
- **Without a registry, development restarts instead of reloading in process.** On Node the warm
  evaluator evaluates each check in a fresh one-shot child, and `relkit dev` leaves out the
  in-process handler-table reload, so every change starts a new candidate generation (about one
  second for the `minimal` template). On Bun nothing changes. A one-shot Node evaluator imports
  candidates without the `?relkit_generation` query, because Node keys modules by URL and the
  query would load a second instance beside the one other candidates import.
- **The supervisor keeps its Bun listener and gains a Node one.** The WebSocket tunnel takes an
  `accept` callback instead of a Bun server, the downstream socket is a small
  `ProxyDownstream` interface (`readyState`, `send`, `close`) both Bun's `ServerWebSocket` and
  Hono's `WSContext` satisfy, and upstream clients close portably (Node's `WebSocket` has no
  `terminate`, rejects close codes a client may not send, and delivers binary frames as
  `ArrayBuffer`). `supervisor/proxy-listener.node.ts` serves through the adapter's `serve` and
  Hono's Node WebSocket upgrade, pinning admission and connecting upstream before it accepts.
  The Bun listener, with its Bun 1.3.10 stop workaround, is unchanged.
- **`relkit build` bundles with esbuild on Node.** One bundler cannot serve both: `bun build`
  is not available on Node, and replacing it on Bun would change Bun builds. On Node,
  `build-bundle-esbuild.ts` runs esbuild with the `bun build` options (externals, splitting with
  a metafile inventory, inline maps in development, minified otherwise) plus a `createRequire`
  banner; `bundleServerEffect` takes the bundler as a parameter so tests pin `bun build`
  whichever runtime runs them. Without `--runtime`, `relkit build` and the development server build for the runtime
  the CLI runs on, so Bun output is unchanged and `relkit dev` on Node serves through
  `relkit/runtime/node`. `relkit start` runs a build with the runtime its manifest records.
- **Package managers.** `create-relkit/package-manager` selects the manager: the creator takes
  `--package-manager bun|npm|pnpm`, then the invoking manager from `npm_config_user_agent`, then
  Bun under Bun and npm under Node; the CLI reads a project's `packageManager` field, then its
  lockfile, then the same fallback. The creator installs with that manager, records
  `packageManager` with the invoking manager's version (or removes Bun's pin when the version is
  unknown) and prints its commands; `relkit doctor` checks the lockfile with that manager's
  frozen install (`npm ci --dry-run`, `pnpm install --frozen-lockfile --lockfile-only`) and
  compares Node with the CLI's `engines.node` on Node; `relkit add` installs with it. pnpm
  projects get a `pnpm-workspace.yaml` that approves esbuild's install script (`allowBuilds` for
  pnpm 11, `onlyBuiltDependencies` for pnpm 10), because pnpm 11 fails an install whose
  dependency scripts were not approved. Template
  scripts already run `relkit`; `test` stays `bun test` because `@relkit/testing` still needs
  Bun, and npm ignores `patchedDependencies`, so npm projects lack the Drizzle declaration repair.
- **Executables start on Node.** The `relkit` launcher, the CLI and the creator use
  `#!/usr/bin/env node`. The launcher runs the project CLI on Bun when it runs on Bun or a Bun
  command invoked it, and on the running Node otherwise; `relkit create` without an installed
  creator fetches it with `bun x`, `pnpm dlx` or `npx --yes`. Bun honours the shebang, so
  `bun run dev` would start the CLI on Node wherever Node is installed; the CLI therefore hands
  itself to Bun when it runs on Node but a Bun command invoked it (`npm_config_user_agent`
  `bun/…`), so Bun projects keep running on Bun (`RELKIT_BUN_HANDOFF=0` keeps Node). The
  creator runs in process on either runtime. The packaged CLI executable is bundled for Node (it runs on both) and keeps the
  TypeScript hook registration as an external file. `import.meta.main` is absent before Node
  22.18, so the CLI's entry points also compare `process.argv[1]`. Node needs import attributes
  on JSON imports, so the creator's `package.json` imports gained `with { type: "json" }`, and
  `create-relkit/catalog-resolution` keeps its source export under a `bun` condition for the cold
  bootstrap while Node resolves the built file.
- **Engines and evidence.** `@relkit/cli` and `create-relkit` left the Bun-only list and list
  Node `>=22.13.0`; `@relkit/testing` (transpiler) and `@relkit/aws` (Valkey client) stay
  Bun-only. The CLI's remaining Bun call sites are the Bun proxy listener and the evaluator's
  guarded `Bun.write` detector. The creation capability identity names `node-<version>` on
  Node, so creation on Node warns that the combination is untested until Node evidence exists.
- **Verification without Bun.** `scripts/node-creation-smoke.ts` (Bun) packs the candidate,
  verifies each archive and writes `index.json`, `tarballs/` and `smoke.mjs`, a Node bundle of
  `node-creation-smoke-run.ts` that serves them as a registry with `node:http` (the Bun fixture
  registry's request handling) and runs `npx create-relkit` or `pnpm dlx create-relkit`, checks
  the manager's lockfile, starts `<manager> run dev` and waits for `GET /hello`. It gives npm
  and pnpm fresh caches (as `npm_config_*` and pnpm 11's `pnpm_config_*`), because the candidate
  shares its version with the published release. Checks run it
  in `node-creation-pack` (Bun) and `node-creation` (Node 22 and 24 × npm and pnpm, no Bun
  installed, `--require-no-bun`), which the CI Gate requires.

### D8. TypeScript 7 (#11)

Generated declaration files (`route-module-checks.ts`, context and event registries) carry every type
guarantee, so plain `tsc` reports everything the editor plugin reports. `relkit check` spawns the
project's compiler binary instead of calling `ts.createProgram`. Codemods and source scanning keep a
private `typescript@5.9` dependency as a parser until TypeScript 7 offers an equivalent API; the
dependency is bundled into `@relkit/cli` so it never constrains the application. The workspace moves
its own type-checking to TypeScript 7; tools that still need the 5.x API, such as the docs generator,
are checked and kept on the private parser if needed.

Decided while applying section 15 (maintainer, 2026-11-05):

- **The private parser is `packages/cli/src/typescript-parser.ts`, bundled at build time.** Every
  CLI module, including `relkit migrate`'s one parser module `src/migration/code-parser.ts`,
  imports `ts` from it (`import ts from "./typescript-parser.js"`), never from `typescript`. It
  re-exports TypeScript 5.9.3 from the private workspace package `relkit-typescript`
  (`tools/typescript-api`, a devDependency), and `scripts/package-typescript-parser.ts` replaces
  the emitted `dist/typescript-parser.js` with a Bun bundle that inlines it, so the published CLI
  depends on no `typescript`. A plain `npm:typescript@5.9.3` alias was tried first and rejected:
  an alias is a direct dependency whose `tsc` executable takes `node_modules/.bin/tsc` (in the
  workspace it replaced TypeScript 7's; in an application installed with npm it could shadow the
  application's own). The workspace package depends on `typescript` itself, and executables of
  transitive dependencies are never linked. The editor plugin bundle maps the package back to the
  editor's own `typescript`,
  because the plugin always receives the editor's TypeScript instance.
- **`route-module-checks.ts` is the one generated file a tsconfig must list.** It references
  `context-registry.d.ts` and `event-registry.d.ts` with `/// <reference path>` directives, so
  plain `tsc` sees every generated guarantee; until normalization writes the registries, `relkit
check` writes an empty module in their place. Templates already listed it; the examples now do
  too. The one plugin finding types could not express, a service route destructured under another
  method's name (`export const { GET: POST } = defineServiceRoutes(...)`), is now a type error:
  `defineServiceRoutes` results carry the type-only `ServiceRouteMethodMarker<Method>` and
  `RouteModuleContract` rejects an export whose marker names another method. Verified with
  TypeScript 7.0.2's `tsc` and no plugin on a template app.
- **`relkit check` runs the project's compiler; RelKit's own analyses keep the private parser.**
  `src/compiler/typescript-compiler.ts` finds the compiler (`node_modules/.bin/tsgo`, then the
  `bin` of `@typescript/native-preview` or `typescript` read from their exported
  `package.json`, because TypeScript 7's `exports` hide `typescript/bin/tsc`) and runs
  `-p <config> --noEmit --pretty false` through the runtime adapter on Bun or Node; its output
  is parsed into RelKit diagnostics, continuation lines included. The `relkit dev` watch uses the
  same lookup, which also fixes it for TypeScript 7. When the project's `tsconfig.json` does not
  list the route checks, or its `rootDir` excludes them, RelKit writes
  `<generated>/tsconfig.check.json`, which extends it with the same files plus the route checks
  and a widened validation root. Route module, event source and unused-error analyses still
  read a program built with the private TypeScript 5.9 API, without its type diagnostics, since
  TypeScript 7 has no stable JavaScript checker API yet. `typecheckProject` now returns a Promise. Prepared checks,
  which pass a `TypecheckInputs` journal to certify reuse, keep their type diagnostics on the
  journal-hosted private-parser program: a separate compiler process would read files the
  journal never observes. A project that installs no compiler is checked by that program too,
  so `RELKIT_TYPESCRIPT_COMPILER_FAILED` reports only a compiler that runs and fails.
- **Templates keep the editor plugin entry, and TypeScript 5.9.3 stays their default.** The plugin
  only adds while-you-type route errors in editors that load TypeScript 5.9 plugins; no check
  depends on it, and the docs say so. Templates drop `baseUrl`, which TypeScript 7 removed, and
  write `paths` relative to the configuration (`"@app/*": ["./src/*"]`). Their `.gitignore` now
  also tracks `.relkit/generated/event-registry.d.ts`, which the route checks reference, so a
  fresh clone type-checks. Moving the generated default to TypeScript 7 is left to a later
  release decision.
- **The TypeScript matrix is the fresh-clone job.** `fresh-clone-typecheck` in `checks.yml` runs
  every template on `typescript: ["5.9", "7"]`; `scripts/fresh-clone-typecheck.ts --typescript`
  pins 5.9.3 or 7.0.2, removes the editor plugin, then runs `typecheck`, `relkit check`,
  `relkit add function` and `typecheck` again. It runs on pull requests that touch the CLI,
  the creator, templates or the workflow.
- **Supported versions are documented in Modules › CLI › TypeScript versions**, which `relkit
check`'s page and Learn › Local development link to.
- **The workspace builds and type-checks with TypeScript 7.0.2 from a named `workspace` catalog.**
  The root, the published packages, the integrations and the Bun examples depend on
  `"typescript": "catalog:workspace"`; the default catalog, which feeds generated applications'
  dependencies, keeps 5.9.3. `apps/docs` (Effect docgen, Astro check and the docs scripts use the
  5.x API), `apps/inspector` and `examples/commerce-web` (Next.js loads the `typescript` API
  during builds) stay on the default catalog. Scripts and tests that read the compiler API import
  `relkit-typescript`. TypeScript 7 removed `baseUrl`, so the examples, the Inspector, the type
  fixtures and the docs tutorial write `paths` relative to their configuration. CI's new
  `workspace-typecheck` job requires `tsc --version` to be 7, builds the packages and runs `bun
run typecheck`. Bun 1.3.10 refreshes a workspace's lock entry only when its dependency names
  change, so moving a workspace between catalogs needs a temporary dependency added and removed.
- **Example tsconfigs no longer extend one another.** Without `baseUrl`, Bun 1.3.10 resolves
  `paths` through `extends` inconsistently: a child's `@app/*` loaded the extended commerce
  modules, and a shared base without `paths` still failed when `relkit check --project-root` ran
  from the repository root. TypeScript resolves them correctly either way. Each example now
  declares its full compiler options and its own `paths`. Generated projects do not extend a
  configuration and are unaffected.

### D9. Deploy targets (#12)

`relkit build` emits a container definition (non-root, health endpoints, no local durable state) for
Bun and Node, and a Workers bundle. `relkit deploy init <target>` writes target files and a CI
workflow: Railway gets `railway.json` plus the container files; Vercel gets `vercel.json` and a Node
function entry; Cloudflare gets `wrangler.jsonc` and the Workers entry. A target uses Pulumi only when
a maintained provider exists. AWS keeps its Pulumi program and moves to Labs until it builds and
pushes images, serves HTTPS, runs several tasks and passes a real deploy test.

Decided while applying section 17 (maintainer, 2026-11-05):

- **`/healthz` is the public platform probe.** The generated server answers `GET /healthz` with
  `{ status, live: true, ready }`: 200 once provider, worker, database and auth readiness hold and
  the server is not draining, 503 before. It carries none of the build identity that
  `/_relkit/v1/health/*` reports, so it is safe on a public URL and needs no internal-endpoint
  authorization. Liveness stays `/_relkit/v1/health/live`; a host that only takes one path (Railway's
  `healthcheckPath`) gates a deploy on readiness, which is what `/healthz` reports. Both images add
  a Docker `HEALTHCHECK` that fetches `/healthz` with the image's own runtime (`bun -e` or
  `node -e`), since neither base image ships curl.
- **The image keeps no durable state, enforced at startup.** Both Dockerfiles set
  `RELKIT_DURABLE_STATE=external`. The build records the jobs and events profiles that use the local
  filesystem provider (the same graph check as the `RELKIT_BUILD_LOCAL_DURABLE_PROVIDER` warning) in
  the server; with that variable set, provider startup fails with
  `RELKIT_LOCAL_DURABLE_STATE_IN_CONTAINER` and `/healthz` stays 503, so a host never routes traffic
  to an instance that would lose jobs on the next redeploy. `RELKIT_ALLOW_LOCAL_DURABLE_STATE=1`
  opts a single instance with a volume mounted at `/app/.relkit/state` back in; the image still
  creates that directory owned by the runtime user so a named volume inherits the ownership. Outside
  the image (`relkit start`, a bare `bun server/index.js`) nothing changes. The build warning now
  names `@relkit/postgres` and says the image refuses the local provider. Both images run on a
  read-only root filesystem (the container test runs them with `--read-only`).
- **`relkit deploy init <target>` routes before the Pulumi parser.** `railway` writes files only;
  `aws`, or no target, keeps initializing the Pulumi stack with the existing options, so current
  scripts keep working. `vercel` and `cloudflare` answer "not available yet" until sections 21 and
  22; `--runtime` and `--force` are rejected on the Pulumi path. The Railway generator writes
  `railway.json` (Dockerfile builder, `healthcheckPath: /healthz`, 120 s health timeout, 70 s
  draining for the server's 60 s drain, restart on failure), a source `Dockerfile`, a
  `.dockerignore` and `.github/workflows/railway-deploy.yml`. An identical existing file is left
  alone, a differing one stops the command before anything is written
  (`RELKIT_DEPLOY_INIT_CONFLICT`) unless `--force`, and the JSON result says
  `cloudResourcesChanged: false`.
- **The source Dockerfile installs from the application's lockfile.** Railway builds from the
  repository, not from `.relkit/build`, so the Dockerfile runs `relkit build --runtime <bun|node>`
  in a build stage, `bun install --frozen-lockfile --production` in a dependency stage, and copies
  the build output and those `node_modules` into the same final stage as the build's own image
  (`productionPolicy` is shared). Installing from the lockfile rather than re-resolving the build
  manifest's exact versions keeps the deployed dependencies the ones the project tested, and also
  lets dependencies that are not on the npm registry (vendored tarballs, as the newcomer test uses
  for the packed candidate) install on Railway's builder.
- **One `railway.json` serves the web and the worker service.** Railway reads environment
  variables from the service, not from the config file, so a worker service uses the same file and
  the same image; the guide sets `RELKIT_WORKER_ROLE=api` on the web service and `worker` on the
  worker service. The workflow runs check, typecheck and tests, then `railway up --ci` with a
  pinned `@railway/cli` for `vars.RAILWAY_SERVICE` and, when set, `vars.RAILWAY_WORKER_SERVICE`,
  authenticated by the `RAILWAY_TOKEN` project-token secret.
- **`RELKIT_TRUST_PROXY=1` takes the scheme from `X-Forwarded-Proto`.** The first live deploy
  showed every browser `POST` denied with `origin-denied`: Railway terminates TLS, the server sees
  `http://<domain>` and the same-origin check compares that with the `https://` `Origin`. With the
  variable set, the generated server rebuilds the request URL with the forwarded scheme (`http` or
  `https` only) before any middleware runs. It is opt-in because a server exposed without a proxy
  must not trust a client-sent header; the Railway Dockerfile sets it, the build's own image does
  not, and the local Docker page tells self-hosters behind a TLS proxy to set it.
- **The newcomer test verifies outcomes in Postgres, not through the app.** It deploys the `api`
  template with a `probe` service (an HTTP-triggered task, a schedule every minute, an event and a
  consumer that triggers the task), opens a Railway TCP proxy to the database, and reads
  `relkit_job_runs`, `relkit_event_deliveries` and `relkit_schedule_occurrences`: every submitted
  job and consumer run `completed` once by operation ID, every delivery completed, a new occurrence
  claimed in each phase and exactly one run per occurrence. The phases are one instance, after
  `railway redeploy` (a job submitted just before it must complete after it), and two replicas
  (`railway scale <region>=2`). Railway's `railway delete` schedules the project for deletion two
  days later but removes every deployment at once, so nothing keeps running or billing.
- **The candidate is vendored into the newcomer project.** The project is created from the local
  registry, then every candidate tarball is copied to `vendor/` and referenced with `file:` both as a
  dependency and in `overrides`, and `bun.lock` is regenerated against the public registry, because
  Railway's builder cannot reach the local registry and its URLs would otherwise leak into the
  lockfile. `@relkit/postgres` joined the packed candidate closure for this
  (`scripts/pack-and-smoke-create-relkit-pack.ts`).
- **The test runs opt-in.** `bun scripts/railway-newcomer.ts` prints a skip unless
  `RELKIT_TEST_RAILWAY=1`; the `railway-newcomer` workflow runs it on pull requests from this
  repository only when the `RELKIT_TEST_RAILWAY` variable is `1`, with `RAILWAY_API_TOKEN` and
  `RAILWAY_WORKSPACE`. `tests/deployment/railway-newcomer.test.ts` runs the same flow against a
  stubbed Railway, endpoint and database in every test run. The Railway target stays Labs (its
  maturity row and docs page) until that workflow passes in CI, per the target-maturity requirement.
- **Gaps found by the newcomer path, worked around in the probe and left for their owners:** the
  templates' `tsconfig.json` lists the generated context registry but not
  `.relkit/generated/event-registry.d.ts`, so any `defineEventFunction` fails to type-check in a new
  project; and an event function without `profile` resolves to `default`, which does not exist
  after `relkit add events --provider postgres` names the profile `postgres`, so `relkit check`
  reports `RELKIT_PROVIDER_PROFILE_UNKNOWN` although `defaults.event` is set.
- **Engines per target are documented on the deployment overview.** Railway: container image with
  the Railway CLI; AWS: Pulumi; Vercel and Cloudflare: platform configuration, not available yet.
  The AWS page lists its four missing Labs criteria, checked against `@relkit/aws` (an ECR repository
  but no image build or push, an HTTP-only listener on port 80, `desiredCount: 1`, no CI deploy).

Decided while applying section 21 (maintainer, 2026-11-05):

- **One Node function serves the whole app.** `relkit deploy init vercel` writes `vercel.json`, the
  function entry `api/relkit.mjs`, `.vercelignore` and `.github/workflows/vercel-deploy.yml`, with the Railway
  generator's rules (identical files kept, `RELKIT_DEPLOY_INIT_CONFLICT` unless `--force`,
  `cloudResourcesChanged: false`). `vercel.json` installs with `bun install --frozen-lockfile`, builds
  with `relkit build --runtime node --target vercel`, serves `.relkit/build/public` from the CDN,
  rewrites every other path to the one function and ships `.relkit/build/**` with it
  (`includeFiles`, 60 s `maxDuration`). One function rather than one per route keeps a single cold
  start and the server's own routing, middleware and health semantics; Vercel picks the Node runtime
  for an `api/*.mjs` entry, so `--runtime bun` is refused for this target. The workflow runs check,
  typecheck and tests, then `vercel deploy --prod` with a pinned CLI, authenticated by the
  `VERCEL_TOKEN` secret and the `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` variables. Vercel builds
  remotely from the uploaded source, as a local `vercel deploy` does, rather than from a prebuilt
  output: `.vercelignore` keeps `node_modules`, `.relkit` and `.env*` out of the upload, and a local
  `vercel build` would have to see `.relkit/build` to package it.
- **The generated server has a function-host mode.** `activateRelkitApplication({ functionHost: true })`
  starts providers and the HTTP application but opens no listener and installs no signal handlers,
  and returns `{ fetch, ready, drain, close }`. The entry forces `RELKIT_WORKER_ROLE=api` (no
  background worker or scheduler loop in an instance Vercel freezes between invocations),
  `RELKIT_DURABLE_STATE=external` and, unless set, `RELKIT_TRUST_PROXY=1`, changes into
  `.relkit/build` so the server sees the same layout as in the image, activates once per instance and
  waits up to 25 s for a cold instance's providers before answering. The word "serverless" is not
  used in source because the repository's scope scan reserves it as an alternate infrastructure
  engine name.
- **Durable work runs in `drain`, woken by Vercel Cron and after requests.** `drain({ budgetMs })`
  reconciles the persisted schedules once per instance, runs one scheduler pass (the Postgres
  backend's unique `(service, schedule, occurrence)` claim makes concurrent passes enqueue each
  occurrence once), then leases job attempts and delivers due events until none is left or the budget
  is spent. Vercel Cron calls `/_relkit/v1/vercel/cron/...` with `Authorization: Bearer
$CRON_SECRET`; the entry compares it in constant time, refuses a missing or shorter than
  16-character secret with 401, and drains for up to 50 s. After every other request the entry
  drains for up to 5 s through Vercel's request-context `waitUntil` (read from the same global
  symbol `@vercel/functions` uses, so the app needs no extra dependency), so jobs and events
  submitted over HTTP run without waiting for the next cron call;
  `RELKIT_VERCEL_DRAIN_AFTER_REQUEST=0` turns that off. The job pass is the same code as the
  container's worker loop (`processNativeJobPass`).
- **Cron entries come from the compiled graph.** `deploy init vercel` reads the schedules from
  `.relkit/generated/application.graph.json` (it asks for `relkit check` first when that file is
  missing) and writes one `crons` entry per distinct expression, named after the first schedule
  that uses it. A UTC numeric five-field cron is copied as is; a timezone, an interval or a
  non-numeric expression falls back to every minute (named in the command's next steps, since only
  paid Vercel plans run per-minute crons), because the cron call only wakes the deployment and the
  backend decides which occurrences are due.
- **`relkit build --target vercel` enforces the target's rules before staging.** The flag implies
  `--runtime node` (and refuses `--runtime bun`). The build fails with
  `RELKIT_VERCEL_LOCAL_DURABLE_STATE` when a used jobs or events profile selects the local provider
  (the same graph check as the image's startup guard, which the function entry also arms with
  `RELKIT_DURABLE_STATE=external`), and with `RELKIT_VERCEL_CRONS_OUT_OF_DATE` when `vercel.json` is
  missing or its `crons` differ from the ones the current schedules need, so a schedule added after
  `deploy init` cannot silently never run. Both are errors, not warnings: unlike a container with a
  volume, a function has no opt-in for local state. The local-state check runs in the CLI before
  bundling rather than only at startup, so the remote build fails instead of a deployment that
  answers 503.
- **The newcomer test deploys to production of a throwaway project and brings its own database.**
  Vercel Cron runs only on production deployments, so the authorized preview is the production
  target of a throwaway `relkit-test-<run id>` project (created through the REST API with deployment
  protection off, deleted in a `finally`). Vercel has no database of its own to provision from a
  script, so the test creates and drops one database per run on a Postgres server named by
  `RELKIT_TEST_VERCEL_DATABASE_URL` (a Neon or other reachable server). It proves HTTPS `/healthz`, an
  HTTP-submitted job and an event consumer completing through the after-request drain, a new schedule
  occurrence claimed while the test sends no request (so Vercel Cron claimed it), exactly one run per
  occurrence after two concurrent authorized cron calls, and a 401 for a wrong secret. The probe's
  every-minute schedule needs a plan with per-minute crons (`VERCEL_TEAM_ID` selects that team). It
  runs opt-in like Railway's (`RELKIT_TEST_VERCEL=1`, `VERCEL_TOKEN` or a `vercel login` session;
  `.github/workflows/vercel-newcomer.yml` gated on the `RELKIT_TEST_VERCEL` variable), and
  `tests/deployment/vercel-newcomer.test.ts` runs the flow against stubs in every test run.
- **`relkit check` refuses per-instance realtime state on Vercel.** When the project root holds
  `vercel.json`, every channel that clients subscribe to (`client` public or protected; internal
  channels are server-side only) must use a realtime profile backed by an external provider, meaning
  any realtime provider other than the local filesystem one (today `redisRealtime()`); otherwise the
  check fails with `RELKIT_VERCEL_REALTIME_PROVIDER_REQUIRED` at the channel's source. The presence of
  `vercel.json` is the target signal because it is what `deploy init vercel` writes and what Vercel
  reads; no separate check flag is needed. The rule is about state, not transport: Vercel functions
  also accept no WebSocket upgrades, which an external provider does not change, so the guide states
  that WebSocket subscriptions need a host that keeps connections open and that realtime on Vercel is
  unverified.
- **The guide and the maturity row stay Labs.** `/docs/modules/deployment/vercel` documents what
  runs as the function, Vercel Cron and the cron secret, the external Postgres requirement, the
  after-request drain, the realtime limits and the newcomer path; the deployment overview lists
  Vercel's engine as platform configuration with one Node function deployed by the Vercel CLI, and
  the maturity table gains "Vercel deploy" as Labs. It moves to Core only once
  `.github/workflows/vercel-newcomer.yml` passes in CI, per the target-maturity requirement.
- **Verified locally, live run pending.** The function entry was driven in Node 24 against the `api`
  template with the probe service, Postgres jobs and events on a local Postgres 17, simulating
  Vercel's request context: cold requests waited for readiness, an HTTP job and an event consumer
  completed through the after-request drain, the cron endpoint refused a missing secret with 401 and
  drained with it, and the claimed occurrence had exactly one run. The live run against Vercel did
  not happen while applying this section: the machine's Vercel CLI token was invalid (`vercel login`
  pending) and no `RELKIT_TEST_VERCEL_DATABASE_URL` server was set up, so the Vercel target stays Labs.

Decided while applying section 22 (maintainer, 2026-11-06):

- **Workers is an adapter name, not a Tier 1 runtime name.** `RuntimeName` stays `"bun" | "node"`
  (the process runtimes the container image, Railway and Vercel use) and `RuntimeAdapterName` adds
  `"workers"`; `RuntimeAdapter.name`, `detectRuntime`, `loadRuntimeAdapter` and the build's
  `--runtime` take the wider type. `relkit/runtime/workers` exports `workersRuntime`: `serve`
  rejects (a Worker has no listener), `files` is undefined, `processes.spawn` and
  `modules.resolve` throw, `which` returns null and there is no module registry. Hashing uses
  `node:crypto`'s synchronous `createHash`, because the adapter contract's `sha256Hex` is
  synchronous and Web Crypto's digest is not; identifiers use Web Crypto's `randomUUID`.
  `detectRuntime` recognizes Workers by `navigator.userAgent === "Cloudflare-Workers"`.
- **Workers run with `nodejs_compat`.** The generated server and `relkit` itself use
  `AsyncLocalStorage`, `node:crypto`, `node:path` and `process.env`; the flag provides them, and
  `nodejs_compat` also fills `process.env` with the Worker's string bindings. The portability check
  treats files under `workers/` or named `*.workers.ts` as Workers adapters, which may import
  `node:*` modules but never Bun's.
- **`relkit build --runtime workers` bundles everything into `server/index.js`.** The build writes
  `server/worker.ts` beside the generated `index.ts` and bundles it with esbuild (on Bun too, since
  `bun build` has no Workers target): neutral platform, `workerd`/`worker` export conditions, every
  dependency included because a Worker cannot install packages beside its script, and only Node
  built-ins and the optional transports the server imports by name left external. The bundle is
  not minified, because minifying folds the server's non-literal imports of optional packages into
  literals that wrangler then tries to resolve, and wrangler bundles the file again anyway (its
  `nodejs_compat` polyfills cover the built-ins workerd lacks). `import.meta.url` is defined as
  `file:///bundle/server/index.js` because a bundled Worker module has none, and an esbuild plugin
  replaces `relkit/runtime`'s lazy imports of the Bun and Node adapters with a stub, which keeps
  `ws` and `@hono/node-server` out of the bundle. The build writes no Dockerfile, `manifest.json`
  records `"runtime": "workers"`, and `relkit start` refuses such a build and points at
  `wrangler dev`.
- **The Worker activates the server lazily, in function-host mode.** A Worker's global scope may not
  generate random values or set timers, and RelKit's module scope does both (Effect fiber IDs at
  `defineApp`), so `worker.ts` imports the server module from its first handler; esbuild then wraps
  the module for lazy evaluation, which in turn forbids top-level await, so the Workers server omits
  the `if (relkitEntryPoint) await activateRelkitApplication()` tail. The entry copies string
  bindings into `process.env` once per isolate, defaults `RELKIT_ENV` to `production` (wrangler dev
  defines `NODE_ENV` as `development`), forces `RELKIT_DURABLE_STATE=external` and
  `RELKIT_WORKER_ROLE=api`, activates with `{ functionHost: true }` (section 21's mode: no listener,
  no signal handlers, no background loop), waits up to 25 s for a cold isolate's providers and
  passes the Worker's `env` as the request bindings. Static files are not read from disk: the
  Workers server emits no `staticFiles` option, and `public/` is served by Workers static assets
  before the Worker runs.
- **The runtime HTTP suite runs on Workers through `wrangler dev`.** With `--runtime workers`,
  `scripts/runtime-http-suite.ts` builds the `api` template for Workers, writes a minimal
  `wrangler.jsonc` (the bundle, `nodejs_compat`, the `public/` assets) under `.relkit/` and serves
  it locally in workerd with a pinned `bunx wrangler@4.151.3 dev`, then runs the template's HTTP
  tests against it, as on Bun and Node. That needed no new dependency in the repository, unlike
  `@cloudflare/vitest-pool-workers` or a direct `miniflare` dependency, and serves the same bundle
  a deploy uploads.

- **A wrangler configuration marks a Workers project for `relkit check`.** As with `vercel.json`
  for Vercel, `relkit check` applies the Workers rules when the project root holds
  `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`, the files `deploy init cloudflare` writes
  and wrangler reads; no separate flag is needed. For every used provider profile (a cache, bucket,
  job, event, event or queue trigger, channel or agent state that names it), the provider must be
  one that runs on Workers: Cloudflare Queues for jobs and events, Durable Objects for realtime,
  Workers KV or Redis for caches, R2 or S3 for buckets, Redis for agent state. Anything else fails
  with `RELKIT_WORKERS_PROVIDER_UNSUPPORTED`, which names the provider, why it cannot run (local
  files, a worker loop in a long-lived process, a listener the Worker does not run) and the
  alternative for that capability; a used profile without a provider fails too, because it would
  fall back to local state. Inngest and Trigger.dev are refused for now because their RelKit
  bindings serve or poll from a process; Postgres jobs and events because their worker loop and
  drain are unverified on Workers. A Drizzle service with the SQLite dialect fails with
  `RELKIT_WORKERS_SQLITE_UNSUPPORTED`, which suggests Postgres through Hyperdrive. Unused profiles
  are not reported. Redis is accepted for caches only, and must use an HTTP URL (task 22.3).

- **Redis on Workers speaks HTTP, chosen by the URL.** `@relkit/redis` keeps one `url` secret: a
  `redis://` or `rediss://` URL opens a socket as before, and an `http://` or `https://` URL sends
  each command as one `fetch` POST of `[command, ...args]`, answered with `{ result }` or
  `{ error }`, the REST protocol Upstash Redis and compatible proxies serve. The access token rides
  in the URL's password and is sent as a bearer token, never in the request URL. On Workers a
  socket URL fails at once with a message that asks for an HTTP URL; the runtime is read through
  `relkit/runtime`'s `detectRuntime`, which is why `runtime` joined the `relkit` areas integrations
  may import. HTTP serves caches only: realtime and agent state wait for changes with a blocking
  `XREAD`, which the protocol cannot do, so their providers refuse an HTTP URL, and the Workers
  check now accepts no provider for agent state (realtime on Workers is Durable Objects, 22.4).
  `ioredis` stays a static import: it bundles and loads in workerd under `nodejs_compat` and is
  never called there.
- **KV and R2 get binding providers; the HTTP and S3 ones stay.** `kv()` (Cloudflare's KV REST
  API) and `r2()` (R2's S3 API with signed URLs) already run anywhere `fetch` does, Workers
  included. `kvBinding({ binding })` and `r2Binding({ binding })` add caches and buckets on the
  Worker's own bindings (`cloudflare-kv-binding`, `cloudflare-r2-binding`), which need no API
  token and record the binding name in the graph so the generator can declare it. The R2 binding
  cannot sign URLs, so that bucket declares no signed-URL features and `r2()` remains the choice
  for them. Providers read bindings through `workersBinding(name)` from `relkit/runtime/workers`,
  on first use, from the `env` the Workers entry stores under `Symbol.for("relkit.workers.bindings")`
  on every event; a missing binding or a call outside a Worker names the binding.
- **Integration modules load statically in a Workers bundle.** The generated
  `runtime-integrations.ts` checks installed integration versions on disk and loads each module
  with a top-level `await`; neither works in a Worker. A Workers build renders it with static
  imports and no startup check: the bundle contains exactly the versions `relkit build` checked.
- **Conformance runs inside workerd.** `@relkit/cloudflare`'s `workers-conformance.test.ts` serves a
  conformance Worker with a pinned `wrangler dev`, with a local KV namespace, a local R2 bucket and
  a Redis REST proxy in front of a real Redis, and asserts each check passes there: the Redis
  protocol and cache checks over HTTP (the same module the Bun and Node socket conformance runs,
  now shared), the socket refusal, the KV and R2 binding checks, and the missing-binding error. It
  runs with `RELKIT_TEST_WORKERS=1` and `REDIS_URL` (or `RELKIT_TEST_DOCKER=1`); unit tests run the
  binding checks against in-memory bindings and the HTTP client against a stub endpoint in every
  run.

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

Decided while applying section 11 (maintainer, 2026-11-05):

- **Names.** A route's `api` path is its target function ID with each segment in camelCase, so
  the first segment is the service: `orders.price-order` is `api.orders.priceOrder`. When several
  routes target one function, the first by method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  and then path keeps the name; the others add their method (`getOrderHead`), or their static
  path segments when the method repeats (`searchOrdersSearch` for `GET /orders/search`), and a
  number as the last resort. `clientApiPaths` in `relkit/contracts` holds the rule, and both the
  generator and the RPC transport call it, so they cannot disagree.
- **What is generated.** `client-registry.d.ts` augments a `ClientApi` interface on
  `@relkit/client` with the service and route tree; the runtime `api` value exported by
  `@relkit/client` (and re-exported by the generated `client.ts`) is a lazy proxy whose
  properties are route references. Frontends therefore keep including only the generated
  declaration file, a route the backend adds is usable without a new runtime module, and a
  pulled contract (`relkit client pull`) renders the same tree from the document.
- **Transport until REST.** The RPC router mounts every route procedure a second time under
  `api.<service>.<name>`, next to the trigger-ID and `METHOD /path` names, so the client reaches
  a route by its API path with no lookup table. Section 23 replaces this transport; the `api`
  object stays.
- **Calls.** Hooks take `api` properties. `createApi(options)` returns the same tree with every
  route callable (`await backend.orders.priceOrder(input)`); its routes can also be passed to the
  hooks. `createClient` keeps returning the raw oRPC client for tests and tools.
- **Errors.** A route's error type is one `RelkitDeclaredError<code, status, data>` per declared
  error plus `RelkitUndeclaredError`, whose `code` is a closed list (the oRPC common codes, the
  identity and idempotency codes, and `NETWORK_ERROR` for a request that got no response), so
  checking `code` narrows `status` and `data`. Hooks and `createApi` wrap a failure without a
  code in `RelkitNetworkError`; mutations add `RelkitWriteError`, which now carries
  `WRITE_NOT_SENT` or `WRITE_OUTCOME_UNKNOWN`.
- **Scope of the hook change.** The route hooks (`useRoute`, `useSuspenseRoute`,
  `useRouteMutation`, `useInfiniteRoute`, `useRouteUtils`, `useStream`) take `api` properties
  and no longer accept strings; the route string selectors and their helper types leave the
  public API. Channel, agent and job hooks keep their declared IDs, because those are not routes
  and the `api` object mirrors routes only; `useRouteMutation` no longer triggers jobs, which
  `useJobTrigger` does.
- **No Effect in the browser.** Every module the browser entries reach (`@relkit/client`,
  `/react`, `/jobs`, `/tanstack-query`) is plain Promise and `AbortSignal` code: services became
  objects, scopes became `createWorkOwner` (abort everything, then wait), streams became async
  generators over `iterateNative`. `effect` and `@effect/vitest` leave the package's
  dependencies. The Bun-only `/server` entries still reach Effect through `relkit`, which is
  fine there. `packages/client/scripts/browser-bundle.ts` bundles the browser entries for a
  browser target and lists every module that imports `effect`; `tests/browser-bundle.test.ts`
  requires the list to be empty. The minified bundle went from 157.6 KiB to 114.5 KiB.
- **What the browser client gave up.** It no longer emits Effect execution logs and metrics
  (`rpc.invoke`, `pending.*`, `agent.observe`, `jobs.observe` and the rest); server-side tracing
  is unchanged. The few runtime values it took from `relkit` (agent capability constants,
  `canonicalJson`, `createOperationId`, the contract events path) are copied into
  `packages/client/src/wire.ts`, and `tests/compatibility/wire.test.ts` checks each against
  `relkit/contracts`.
- **Development contract channel.** The channel is the backend's public development port, the
  one the frontend already calls. The supervisor's stable proxy serves
  `GET /_relkit/v1/client/contract-events` itself (through its existing `intercept` option), so
  the stream outlives generation switches and never holds a retiring generation's drain open.
  `packages/cli/src/supervisor/contract-publish.ts` holds the publisher; it listens to the
  supervisor's `switch-succeeded` telemetry and sends a `contract` event, and
  `commands/dev-session-native.ts` wires it in with three lines, leaving the supervisor
  otherwise untouched for section 13. The event carries only the generation number;
  `RelkitClientProvider` answers it, and the `ready` event on every reconnect, by re-reading the
  identity document, so the new public fingerprint changes the query scope and queries refetch.
  Once the stream has connected, the provider trusts the backend's fingerprint over the one
  compiled into the frontend and no longer reports `application-updated`; outside `relkit dev`
  the stream answers 404 and the old check stays. The runtime `api` proxy needs no reload, and
  types follow because the frontend includes the regenerated `client-registry.d.ts`.
- **Browser proof.** The commerce browser fixture mounts the same publisher plus a test-only
  endpoint that switches the reported fingerprint; `tests/e2e-commerce/contract-reload.spec.ts`
  checks that the page re-reads its identity, refetches under the new contract, shows no restart
  alert and still posts. With the provider's subscription disabled the test fails.
- **Consumers.** The repository's own frontends move by hand: `examples/commerce-web`
  (`api.orders.searchOrders`, `api.announcements.getAnnouncements`, `postAnnouncement`,
  `api.orders.streamOrderReport`), the fullstack template (`api.hello.hello`), and the docs
  examples, which follow the backend each one targets (the minimal starter's `hello.greet`
  gives `api.hello.greet`). The starter skill references change in the minimal template, which
  `tests/generator/skill-consistency.test.ts` treats as the source, and are copied to the other
  starters; that changes the minimal template's bytes, so the pinned `templateDigest` in
  `packages/create-relkit/src/create-capabilities.ts` is updated, as earlier template changes did.

Decided while applying section 23 (maintainer, 2026-11-05):

- **OpenAPILink evaluated; RelKit keeps its own small REST link.** The spike
  (`tests/runtime-rpc/runtime-hono/openapi-link-evaluation.test.ts`, oRPC 1.16.1, one test per
  data kind over a real RelKit REST application) found: dates travel as ISO strings both ways,
  which is all JSON can do and matches the client's JSON Schema types; large integers go out as
  decimal strings, but the route answered 500 because REST's JSON encoder could not write a
  bigint, so REST bodies and SSE items now write a bigint as its exact decimal string; files go
  as multipart form data that a route's `multipart` mapping reads; streams fail silently,
  because OpenAPILink reads only oRPC's own SSE events (`message`, `error`, `done`) and yields
  none of RelKit's `relkit-item` events. Beyond the data kinds, OpenAPILink needs an oRPC
  contract with `route()` metadata on the client, can express only oRPC's input structures
  (not RelKit mappings that rename fields or read headers or path segments), and reads oRPC's
  error body rather than Problem Details. RelKit therefore calls routes with a small link of
  its own (`packages/client/src/rest-*.ts`): it reads each route's compiled request mapping from
  the backend and writes every input field where the server reads it, reads Problem Details and
  RelKit's stream formats, and needs no oRPC on that path.
- **REST transport.** Routes reach the client through a new framework document,
  `GET /_relkit/v1/client/routes` (no-store, installed with the REST routes, so every runtime
  serves it): for each client route its `api` path, method, path pattern, compiled request
  mapping, stream format, operation and declared error codes, which the OpenAPI document
  already publishes. The client loads it on its first route call and loads it again, at most
  once a second, when a call names a route it lacks, so a route added during development works
  without a restart. Calls whose first segment is `jobs` or starts with `relkit.` (jobs,
  agents, channels) keep the RPC protocol; every other name, whether an `api` path, a
  `METHOD /path` selector or a route ID passed to the raw `createClient`, is a route and goes
  to REST, so `createClient`, `createApi`, the hooks, streaming and job watch keep their
  signatures.
- **Encoding.** The link walks the mapping backwards: path and catch-all segments are
  URI-encoded, query and header values are text (dates in ISO 8601, objects as JSON), `body`
  fields form one JSON object (a bigint becomes its decimal string), `multipart` fields form
  `FormData` with files kept as files, and cookies, middleware values and constants are not
  sent. A route that maps a custom header needs that header in `transportSecurity.allowedHeaders`
  for cross-origin browsers, as any REST caller would.
- **Responses and errors.** JSON, text and other bodies (as a `Blob`) decode by content type;
  stream routes yield SSE `relkit-item` payloads, text chunks or byte chunks, and `return()`
  aborts the request. A Problem Details failure becomes an `ORPCError` with the response status
  and `detail` as message: a declared code or an upper-case framework code
  (`IDENTITY_PRECONDITION_FAILED`) is kept, any other code becomes the common code for the
  status (`validation-failed` 400 is `BAD_REQUEST` with the issues in `data.issues`), so the
  client's error union does not change.
- **Identity on REST mutations.** A mutation route that receives the typed client's
  `x-relkit-identity-scope` and `x-relkit-session-epoch` headers answers 409
  `IDENTITY_PRECONDITION_FAILED` when the session changed, as the RPC endpoint did; requests
  without those headers, such as curl, are not affected (`runtime-hono/route-identity.ts`).
- **Browser proof.** `tests/e2e-commerce/rest-wire.spec.ts` checks that the commerce page sends
  `GET /orders`, `GET /announcements`, `POST /announcements` and `GET /reports/daily` and no
  request under `/rpc`. It needs `next dev`, which the shared machine's resource budget did not
  allow while other sessions ran, and no pull-request workflow runs the commerce browser suite,
  so it was written but not run here.
- **`/rpc` removed; what stays on RPC.** Channels, agents and jobs have no REST routes, and
  building REST and WebSocket protocols for them was outside this section, so they keep the oRPC
  protocol at a framework path, `/_relkit/v1/rpc` (HTTP and WebSocket), next to RelKit's other
  framework endpoints and outside the OpenAPI document. The RPC router no longer contains route
  procedures, route-ID or `METHOD /path` names, or the `api` tree (`rpc-api-tree.ts` and
  `rpc-middleware-trace.ts` are gone), and nothing answers at `/rpc`. Requests under `/_relkit/`
  skip application middleware, server spans and request records as control-plane traffic; the
  RPC endpoint carries application calls, so `isRelkitControlPlanePath` excludes it and those
  calls are observed exactly as they were at `/rpc`. Frontend proxies forward the route paths
  they call plus `/_relkit` (with WebSockets) instead of `/rpc`.
- **oRPC version.** npm has no stable oRPC 2.x: its `2.0.0` is a deprecated publish from 2024 and
  the 2.0 line is still in beta (`2.0.0-beta.48`). Every `@orpc/*` package moves to the latest
  stable 1.x, `1.16.1`, and leaves `docs/dependencies.md`. The 1.x port: `eventIterator` replaces
  `asyncIteratorObject`; the handlers' `errorStatusMap` becomes a client interceptor
  (`runtime-hono/rpc-handler-options.ts`) that gives a thrown error its declared status, since 1.x
  reads the status from the error; WebSocket calls get `rpcHeaders` from a root interceptor; the
  client's 1.x WebSocket link is bound to one socket, so `webSocketLink` opens a new socket for
  the next call after one closes; and the HTTP link hands a caller's `fetch` the URL and an init
  with headers, body and signal, as before, because 1.x passes a `Request`.
- **Drizzle.** No stable Drizzle 1.0 exists (the stable line is 0.45, without the Effect
  integration), so the `1.0.0-rc.5-169397b` pin and its patch stay, with the exit plan updated:
  `drizzle-orm@1.0.0-rc.5` (2026-10-21) already imports `effect/sql`, so moving to it removes the
  patch together with the patch-shipping steps in `create-relkit` and the CLI build catalog. That
  removal touches the creation and packaging code other sections own, so it is left as the exit
  plan's next step rather than done here.

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

#### Decided while applying section 20

- **The metrics are one JSON report and one generated docs page.** `scripts/metrics.ts` reads a
  directory of downloaded CI artifacts, classifies every `*.json` below it by its `protocol` field
  (the agent evaluation summary by its keys) and writes `metrics.json` (`relkit.metrics`, version 1):
  nine metrics, each with its current value, its target from the lead review (section 6), a status
  (`met`, `not-met` or `no-data`) and a note on where the number came from. A missing, unreadable or
  unrecognized output is "no data", never a failure. The page `/docs/metrics` includes a snippet that
  `apps/docs/scripts/generate.ts` renders from `RELKIT_METRICS_REPORT` when CI sets it, otherwise from
  the checked-in `apps/docs/data/metrics.json`. That fallback holds only what the workspace itself can
  measure (the package count) and shows "no data" for the rest, so the repository never publishes
  invented numbers; `bun scripts/metrics.ts --inputs none --output apps/docs/data` refreshes it. The
  fixtures under `tests/fixtures/metrics` are sample values for tests and are labeled as such.
- **Producers write result files; the report never parses logs.** The nightly canary, the candidate
  canary and the runtime matrix each record `relkit.creation-canary-result` or
  `relkit.runtime-http-result` with `scripts/metrics/write-result.ts` (or `jq` in the nightly canary,
  which has no checkout) and upload it as a `metrics-*` artifact. The dev-loop benchmark report and the
  agent evaluation summary already existed and are read as they are. Creation success prefers the
  nightly run of `create-relkit@latest` and falls back to the candidate canary when only that ran;
  the value names which one.
- **Two publishing paths.** On every pull request the `metrics` job in `checks.yml` downloads the
  artifacts of its own run (including the called release-readiness workflow), builds the report and
  uploads it; it is part of the CI Gate because the report is cheap and every input is tolerant of
  absence. `metrics.yml` runs weekly, on release publication and on dispatch, downloads the
  artifacts of the latest main CI run, the latest nightly canary and the latest walkthrough runs with
  `gh run download`, and attaches `metrics.json` to a published release. Release notes always link
  `https://relkit.dev/docs/metrics` (`METRICS_URL` in `scripts/release-check.ts`, asserted by the
  release-notes test). `RELEASE_NOTES.md` is regenerated by the versioning step, so it gains the
  link at the next release rather than in this change.
- **Targets are numeric where the plan is.** First route under 5 minutes, Railway deploy under 15
  minutes, reload p95 under 1 second and `relkit check` memory at or below `tsc` for the 100-function
  app, 10 or more outside contributions per month, and all five templates created on the latest Bun.
  Runtimes are met when Bun and Node both pass; Workers joins at Tier 2. The agent evaluation target
  ("published every release") is met whenever a summary exists. Outside contributions are issues and
  pull requests from authors who are not owners, members, collaborators or bots, over 30 days; the
  target applies after launch, so before launch the status is `not-met` with a note.
- **"Six first-party plus integrations" is a named list.** The six are `relkit`, `@relkit/cli`,
  `@relkit/client`, `@relkit/inspector`, `@relkit/testing` and `create-relkit`. The deprecated
  `@relkit/app`, `@relkit/better-auth` and `@relkit/drizzle` stay under `packages/` as optional
  tools and count with the integrations. The metric is met when the six exist and nothing else
  sits under `packages/`.
- **Two walkthroughs, one result shape.** `scripts/walkthrough/create-to-first-route.ts` packs the
  candidate once, creates the `minimal` template from a local registry with `create-relkit --install`,
  adds a function and a route, starts `relkit dev` and times the first correct answer from the new
  route. `scripts/walkthrough/create-to-railway.ts` wraps `scripts/railway-newcomer.ts` (unchanged
  apart from error detail) and reports creation plus install plus deploy until the app answers over
  HTTPS. Both write `relkit.walkthrough-result`. Packing the candidate is excluded from both times,
  because a newcomer downloads packages instead of building them; the result's `note` says so and
  gives the pack time. A run without Railway credentials (no `RAILWAY_API_TOKEN`, `railway whoami`
  failing) or with `--stub` runs the stubbed flow and records `stubbed` with no seconds, which the
  report shows as "no data". CI runs the first-route walkthrough weekly (`walkthrough.yml`) and the
  Railway one inside `railway-newcomer.yml`; both upload `metrics-walkthrough-*` artifacts.
- **The local first-route timing is a warm-cache number.** The local run reuses Bun's package cache
  and a loopback registry, so it measures RelKit's own creation and reload work, not the network.
  A CI run on a clean runner is the figure to publish; the checked-in inputs under
  `apps/docs/data/metric-inputs` say "measured locally" in their notes.
- **The checklist has two modes.** `scripts/launch/checklist.ts` reads `metrics.json`, the checkout
  and (with `--github`) the repository state through read-only `gh` calls. Report mode, the default,
  lists every item, marks open ones and exits 0; it runs in the `metrics` job of every pull request
  because before launch the community items are open by design and a failing check would block all
  work. `--strict` exits 1 while any item is open; it is the launch gate, run by the maintainer through
  the `Plan metrics` workflow's `strict` input before announcing, and it is not part of ordinary
  releases (`0.9.0-beta` and `0.9.0` publish before launch). Items: the five P0 decisions (#1 canary
  metric met, #2 Why RelKit and FAQ pages exist, #3 WRITING.md and the positioning sentence on every
  surface, #4 the third-party schema suite and docs, #5 the maturity table consistent), the Railway
  time under 15 minutes, Discussions on, the description equal to the positioning sentence, at
  least 8 open `good first issue` issues ("about ten"), and the roadmap page. An unreadable GitHub or
  missing metrics leaves the dependent items open with the reason.
- **The community launch is prepared, not applied.** `scripts/launch/apply-github.ts` enables
  Discussions, sets the description, creates any missing label and the ten issues in
  `scripts/launch/good-first-issues.md`, and labels existing issue #174. It defaults to a dry run
  (it reads the repository, prints each write as `[dry run] would run: gh ...`, and writes nothing);
  `--apply` makes the changes. Labels and issues that exist are skipped. The repository already has
  the positioning sentence as its description, and the labels `good first issue`, `help wanted`,
  `documentation` and `bug`; Discussions is off. The maintainer runs the apply step when the launch
  goes live; task 20.3 stays unchecked until then.
- **The Railway walkthrough found a defect that blocks the deploy path.** Run live on 2026-11-05
  with the signed-in CLI, the newcomer project (api template, Postgres jobs and events, the probe,
  `relkit deploy init railway`) prepared and passed `relkit check`, but `railway up` failed. The same
  failure reproduces without Railway: `relkit build --runtime bun` inside `oven/bun:1.3.10` on
  Linux reports `RELKIT_ROUTE_MODULE_TYPE` ("must be a typed route descriptor") for every route
  while `tsc --noEmit` in that container passes and the build passes on macOS. It is not the
  generated `.dockerignore` (builds pass on macOS with and without `.relkit/generated`, and
  loosening the ignore file did not change the Railway result), not a missing TypeScript, and not
  a duplicate `relkit` copy. Until an owner fixes it the metric reads "failed", not "no data",
  because the live run happened. Two defects in the test itself were fixed on the way: the probe
  imported `@relkit/app/*`, which new projects no longer install, and `railway up` build output
  was dropped from the error. Hand-over detail: `g20-metrics-launch.md` in the shared notes.

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

Decided while applying section 26 (maintainer, 2026-11-05):

- **One helper, one code family.** `deprecated(code, replacement)` in `relkit/diagnostics` logs a
  `RELKIT_DEPRECATED_*` warning through the Effect logger once per process for each code. The
  message is the code, the catalog title, the replacement and the code's docs URL; `code` and
  `replacement` are also log annotations. Its code argument is typed to the
  `RELKIT_DEPRECATED_*` entries in `codes/deprecated.ts`, so a deprecation needs a catalog entry and
  therefore a generated docs page. `resetDeprecationWarnings()` exists for tests.
- **Two deprecations ship today.** `RELKIT_DEPRECATED_APP_PACKAGE` fires when any entry of the final
  `@relkit/app` is imported (every entry imports `deprecated.js`, and the package's `sideEffects`
  lists `./dist/deprecated.js` so a bundler keeps the call). `RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS`
  fires when `defineBetterAuthService` receives options instead of `{ auth }`, the one section 9
  and 10 form kept as a transition; the `better-auth-file` rule migrates it.
- **A runtime warning, not yet a check finding.** The warning appears when the deprecated API runs.
  Reporting the same deprecations from `relkit check` with file and line is not part of this task.
- **The 1.0 target date is relative.** The lead review gives no date, so the versioning page states
  "the quarter after `0.9.0` ships" and says the page is updated if a criterion is missed. The
  criteria are Core complete on Tier 1 runtimes (Bun, Node 22 and 24), a green creation canary, the
  Railway newcomer test passing and the review's metrics targets.
- **Semver covers documented Core APIs, the CLI's commands and flags, and `RELKIT_*` codes.** Labs and
  undocumented behavior are outside it. Before 1.0, minor releases can break Core only through the
  deprecation window after `0.9.0`.

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
