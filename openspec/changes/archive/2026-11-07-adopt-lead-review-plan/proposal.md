# Proposal

## Why

RelKit's core is strong — one application graph drives the runtime, OpenAPI, typed client, Inspector
and deployment plan — but new developers cannot get started: `create-relkit` refuses current Bun and
four of its five templates, apps run only on Bun, real Zod schemas fail compilation, durable events
live on a container's disk, and the public API spreads across 56 packages with several ways to do
the same thing. This change implements the plan agreed over five review rounds in
`docs/reviews/2026-11-02-relkit-lead-review.md` (decisions #1–#22, the stop-doing rules and the
metrics), so RelKit reaches TypeScript developers broadly and is production-ready before 1.0.

## What Changes

**Open the front door**

- `create-relkit` accepts the declared Bun range, warns about untested combinations (`--strict`
  refuses them) and offers all five templates; certification moves to CI and a nightly canary (#1).
- One positioning sentence everywhere, a "Why RelKit" page with honest comparisons, an FAQ and a
  "Migrate from Express or Hono" guide (#2).
- A plain-language standard for the README, docs, CLI output, errors and changelog: one product
  name, coded errors with docs links, no internal process terms (#3).
- Any Standard Schema validator (Zod 4, ArkType, Effect Schema, Valibot) works for function, event,
  task and error schemas; templates use Zod 4. **BREAKING**: the built-in builder is exported as `s`
  instead of `z` (#4).

**Focus and packaging**

- Core and Labs maturity tiers with docs badges and TSDoc tags; no new feature areas until Core
  reaches 1.0 (#5).
- **BREAKING**: `relkit` becomes the core package (replacing `@relkit/app`); `@relkit/*` holds
  integrations and optional tools; every package shares one version; the 42 framework packages
  become five plus `create-relkit`; no `internal/*` subpaths (#6).
- OpenSpec only for defined cases, evidence in CI artifacts and release assets, repository hygiene
  and a short contributor quickstart (#7); a pre-release dependency policy (#8); the standing
  stop-doing rules until 1.0.

**Reach every TypeScript developer**

- A warm, incremental dev loop with published reload and memory budgets; the prepared-start
  snapshot cache is retired (#9).
- Runtime tiers: Bun and Node LTS run everything, Cloudflare Workers runs HTTP, other runtimes start
  in Labs (#10).
- TypeScript 7 support for applications and for RelKit's own codebase; type guarantees through plain
  `tsc`; the editor plugin becomes optional (#11).

**Production**

- A production container image and `relkit deploy init <target>`; Railway first, then Vercel, then
  Cloudflare; Pulumi where a maintained provider exists; AWS hosting becomes Labs until it meets its
  criteria (#12).
- A Postgres backend for jobs, events and schedules with a transactional outbox and one run per
  schedule occurrence across instances (#12).
- **BREAKING**: one RFC 9457 Problem Details error format; throwing declared errors; route response
  options; route-level `auth: "required"` replaces protected-path lists; function `access` rules with
  roles; typed middleware data; several typed databases; a plain Better Auth file replaces the
  options form (#13).

**One coherent API** (ships with the `relkit` rename as one breaking release, beta first)

- **BREAKING**: a Promise-only main entry point; Effect helpers move to `relkit/effect`; handlers
  that return Effects keep working; generated apps drop the direct `effect` dependency (#14).
- **BREAKING**: dependencies are declared once and called through `ctx`; descriptor `.invoke()` is
  removed; `getRelkit()` and `createRelkit()` give access outside handlers; public things such as
  errors need explicit IDs; duplicate APIs, aliases and legacy jobs are removed; `defineServiceRoutes`
  needs no destructuring (#15).
- **BREAKING** (client call sites): the typed client uses API references such as
  `api.orders.list`, typed error codes and no Effect; it later switches from RPC to REST under the
  hood without changing user code (#16).

**Agents, ecosystem and community**

- Agents run through adapters; LangChain is the first adapter and the Vercel AI SDK the second (#22).
- `relkit mcp`, a development-only MCP server built on the Inspector API and tested with the MCP
  Inspector; new Inspector actions (#18).
- A provider-author kit with public conformance suites (#19); a stability policy and 1.0 criteria
  (#20); a community launch after the P0 items once the Railway newcomer test passes (#21); plan
  metrics measured and published.

**Out of scope**: escape hatches and eject (#17) stay deferred until a follow-up proposal shows more
API examples and a way to prove that eject works.

## Capabilities

### New Capabilities

- `package-distribution`: the `relkit` core package, the `@relkit/*` scope, one release version,
  consolidated packages and the deprecated `@relkit/app` re-export.
- `release-stability`: Core and Labs tiers, the feature freeze until 1.0, semantic versioning,
  deprecations, migrations and the 1.0 criteria.
- `project-governance`: when OpenSpec is required, where evidence lives, repository hygiene,
  contributor onboarding, the dependency policy, stop-doing rules, community launch and plan metrics.
- `user-facing-text`: one product name, actionable coded messages with docs pages, banned internal
  terms, the changelog format and accurate facts.
- `runtime-portability`: runtime tiers, runtime adapters, portable integrations and the runtime CI
  matrix.
- `typescript-compatibility`: type guarantees through plain `tsc`, TypeScript 7 for applications and
  for RelKit, and an optional editor plugin.
- `development-loop`: incremental reloads, non-blocking type errors, restart rules and published
  reload and memory budgets.
- `deployment-targets`: the production container image, `relkit deploy init`, the Railway, Vercel
  and Cloudflare targets and per-target engine selection.
- `durable-postgres-backend`: Postgres-backed jobs, events and schedules with a transactional outbox
  and one run per schedule occurrence.
- `access-control`: route-level authentication and function access rules enforced for every caller.
- `runtime-handle`: `getRelkit()` and `createRelkit()` for code outside function handlers.
- `agent-adapters`: portable agent definitions run by LangChain and AI SDK adapters with shared
  conformance.
- `developer-mcp`: the development-only `relkit mcp` server and MCP Inspector compatibility.
- `provider-authoring-kit`: the provider-author guide, starter package and public conformance
  suites.

### Modified Capabilities

- `cli-scaffolding`: creation offers every combination with warnings and `--strict`; all templates;
  `add` covers backends, exporters and deploy targets; preparation publishes no snapshot; templates
  use the new packages and Zod 4; fresh clones type-check.
- `acceptance-verification`: readiness measurement drives creation warnings instead of refusals; a
  nightly creation canary; runtime, TypeScript, benchmark, deploy and agent-eval matrices join
  release readiness.
- `public-authoring`: Promise-only main entry with opt-in Effect helpers; third-party Standard
  Schema projection and the `s` builder; thrown or returned declared errors with explicit IDs; no
  descriptor `.invoke()`; dependencies declared once; one spelling per concept; route response
  options; typed middleware data; the deprecated job `profile` alias is removed.
- `compiler-graph`: explicit error IDs, third-party schema projection, and removal of the
  development snapshot requirements.
- `http-runtime`: Problem Details errors, route-level authentication, the API-object client, one wire
  protocol and contract updates without frontend restarts.
- `function-runtime`: Effect handlers in the same fiber with no public leakage, context-based calls
  replacing descriptor invocation, and several typed databases.
- `domain-services`: the plain Better Auth file and service route maps without destructuring.
- `jobs-events`: legacy function-target jobs removed, one run per schedule occurrence across
  instances, and documented delivery guarantees.
- `pulumi-aws-deployment`: Pulumi becomes the engine for targets with maintained providers, and AWS
  hosting is Labs until it meets its criteria.
- `tools-agents`: the LangChain-default requirements give way to adapters.
- `ai-sdk-migration`: the AI SDK returns only as an agent adapter.
- `developer-documentation`: positioning, Why RelKit, Labs badges, production and deployment guides,
  benchmarks and versioning pages, a curated API reference, `check` behavior and the template skill's
  deployment reference.
- `development-inspector`: event and job actions, an MCP tools page and a versioned Inspector API.
- `workspace-foundation`: integrations on the shared version with metadata in the creator, and the
  workspace on TypeScript 7.

## Impact

- **Code**: nearly every package (rename and consolidation), the compiler, the CLI (`create`, `dev`,
  `add`, `deploy`, `migrate`, `mcp`), the runtime (errors, auth, middleware, client transport,
  runtime adapters), functions and engine (context dependencies, runtime handle, access rules),
  schema, client, testing, Better Auth, Drizzle, jobs and events (Postgres backend), LangChain
  (adapter), Inspector and its API, docs site, templates, examples, CI and release tooling.
- **Public API**: one breaking release (0.9.0 in examples), published as a beta first, with one
  `relkit migrate` codemod and one migration guide; a final deprecated `@relkit/app` re-exports
  `relkit`.
- **Dependencies**: Zod 4 in templates; a Postgres driver; a Node HTTP adapter; the TypeScript 7
  toolchain; Workers types; a path off the oRPC 2.0 beta and the Drizzle release candidate.
- **Process and CI**: OpenSpec scope, evidence storage, contributor docs, and matrices for Bun, Node
  and Workers, TypeScript 5.9 and 7, nightly creation and development-loop benchmarks.
- **Ordering**: archive after `lean-installation-and-standalone-inspector`, which modifies four of
  the same requirements; the deltas here build on that change's text.
