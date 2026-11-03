# RelKit lead review and plan

> **Status:** Agreed plan after five review rounds on 2026-11-02. Nothing is implemented yet. Only
> the deferred #17 still needs a decision.
>
> **Reviewed at:** `0e6f85e3f` (branch `fix/inspector-api-reference-and-runtime-errors`, since
> merged to main as [rel-kit/relkit#172](https://github.com/rel-kit/relkit/pull/172)) ·
> **Perspective:** acting product and engineering lead

## Contents

1. [Summary](#1-summary)
2. [How to read this document](#2-how-to-read-this-document)
3. [Decision log](#3-decision-log)
4. [The plan](#4-the-plan)
   - [A. Open the front door](#a-open-the-front-door)
   - [B. Focus and packaging](#b-focus-and-packaging)
   - [C. Reach every TypeScript developer](#c-reach-every-typescript-developer)
   - [D. Production](#d-production)
   - [E. One coherent API](#e-one-coherent-api)
   - [F. Agents, ecosystem and community](#f-agents-ecosystem-and-community)
   - [G. Deferred items](#g-deferred-items)
5. [Roadmap](#5-roadmap)
6. [Metrics to track](#6-metrics-to-track)
7. [What to stop doing](#7-what-to-stop-doing)
8. [Background: the review](#8-background-the-review)

- [Appendix A. Data sources](#appendix-a-data-sources)
- [Appendix B. Reproducing the verified checks](#appendix-b-reproducing-the-verified-checks)
- [Appendix C. Review history](#appendix-c-review-history)

---

## 1. Summary

RelKit has an unusually strong core: one canonical application graph drives the runtime, OpenAPI,
typed client, Inspector and deployment plan. Its reach has not caught up. There are no visible
outside users yet, and a new developer cannot get through the front door today.

The agreed plan:

1. **Open the front door.** `create-relkit` works on current Bun with every template. Add a "Why
   RelKit" page, use plain language in everything users read, and accept any Standard Schema
   validator (Zod, ArkType, Effect Schema, Valibot).
2. **Focus.** Split Core from Labs, add no new feature areas until Core reaches 1.0, and keep
   pre-release dependencies out of users' installs.
3. **One core package, one version.** `relkit` is the core package
   (`import { defineFunction } from "relkit"`), `@relkit/*` holds integrations and optional tools, and
   every package shares one version.
4. **Reach every TypeScript developer.** Support Bun, Node and other stable runtimes in tiers, move to
   TypeScript 7 (RelKit's own codebase included), and make the dev loop fast and measured.
5. **Production.** Self-hosting first, with durable Postgres-backed jobs, events and schedules.
   Railway is the first deploy target, then Vercel, then Cloudflare.
6. **One coherent API.** One error format; auth on routes and functions; a plain Better Auth file;
   a Promise-first API that still runs Effect code; one way to reach dependencies, including outside
   handlers; one wire protocol.
7. **Agents, ecosystem and community.** Agents run through adapters, with LangChain first. Ship
   `relkit mcp` (also working with the MCP Inspector), a provider SDK and a stability policy, then
   launch.

The `relkit` rename and every change that breaks existing code ship together as one release, with one
codemod and one migration guide ([roadmap phase 2](#5-roadmap)).

Five habits that work against this plan stop until Core reaches 1.0
([section 7](#7-what-to-stop-doing)).

Deferred: escape hatches and eject (#17). Nothing else is open.

## 2. How to read this document

- **Priority:** P0 = next two weeks, blocks adoption · P1 = this quarter · P2 = next quarter.
- **Effort** (one maintainer working with coding agents): S = days · M = 1–3 weeks · L = 1–2 months.
- **Status:** Agreed · Agreed with changes (the maintainer changed or extended the proposal) ·
  Deferred · Open.
- **Evidence:** links point at the reviewed commit and are relative to this file. "Reproduced" means
  the behaviour was confirmed by running code; see
  [Appendix B](#appendix-b-reproducing-the-verified-checks).
- Examples marked "proposed" are design sketches, not existing APIs.

## 3. Decision log

| #   | Decision                                                                        | Status              | Priority | Effort |
| --- | ------------------------------------------------------------------------------- | ------------------- | -------- | ------ |
| 1   | `create-relkit` works on current Bun, with every template                       | Agreed              | P0       | S      |
| 2   | A "Why RelKit" page                                                             | Agreed              | P0       | S      |
| 3   | Plain language everywhere users read                                            | Agreed              | P0       | S–M    |
| 4   | Any Standard Schema validator: Zod, ArkType, Effect Schema, Valibot             | Agreed              | P0       | M      |
| 5   | Core and Labs; no new feature areas until 1.0                                   | Agreed              | P0       | M      |
| 6   | `relkit` for the core, `@relkit/*` for integrations and tools, one version      | Agreed with changes | P1       | M–L    |
| 7   | Right-size process, evidence and repository hygiene                             | Agreed              | P1       | S–M    |
| 8   | Pre-release dependency policy                                                   | Agreed              | P2       | S      |
| 9   | Fast, incremental dev loop with published budgets                               | Agreed              | P1       | L      |
| 10  | Bun, Node and other stable runtimes, in tiers                                   | Agreed with changes | P1       | M–L    |
| 11  | TypeScript 7, including RelKit's own codebase                                   | Agreed with changes | P1       | M      |
| 12  | Self-hosting first with durable backends; Railway, then Vercel, then Cloudflare | Agreed with changes | P1       | M–L    |
| 13  | Finish the HTTP and auth model, including a plain Better Auth file              | Agreed with changes | P1       | M      |
| 14  | A Promise-first API that still runs Effect code                                 | Agreed              | P1       | M      |
| 15  | One way to do each thing, including access outside handlers                     | Agreed with changes | P1       | M      |
| 16  | One wire protocol and a leaner typed client                                     | Agreed              | P1 / P2  | M      |
| 17  | Escape hatches and eject                                                        | Deferred            | —        | M      |
| 18  | `relkit mcp`, also working with the MCP Inspector                               | Agreed with changes | P1       | M      |
| 19  | Provider SDK with a conformance kit                                             | Agreed              | P2       | M      |
| 20  | Stability policy and 1.0 criteria                                               | Agreed              | P2       | S      |
| 21  | Community launch after the P0 items                                             | Agreed              | P2       | S      |
| 22  | Agents run through adapters, LangChain first                                    | Agreed (new)        | P2       | M      |

**Release decision (round 3).** Everything that changes existing user code ships in one breaking
release, with one codemod and one migration guide: #6, #13 (a, the route-level part of d, and g),
#14, #15 and #16's new call style. Additive changes can ship before or after it. Section
[E](#e-one-coherent-api) lists exactly what the release breaks, and [phase 2 of the roadmap](#5-roadmap)
schedules it.

**What to stop doing (round 4).** Adopted as proposed; see [section 7](#7-what-to-stop-doing).

Answers to the open questions from the first round:

| Question              | Answer                                               | Effect on the plan                                                                                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Primary persona       | Both: solo developers and teams                      | Node support, roles and permissions (#13) and one version (#6) stay high priority                                   |
| Runtimes              | All stable runtimes                                  | Support tiers in #10                                                                                                |
| Effect                | Internal, but Effect code written by users must work | #14                                                                                                                 |
| Agent runtime         | Adapters                                             | #22                                                                                                                 |
| Inspector future      | Not sure yet; maybe                                  | Keep the Inspector API versioned and documented so a hosted or team version stays possible; don't build hosting now |
| OpenSpec and evidence | As recommended                                       | #7                                                                                                                  |

## 4. The plan

### A. Open the front door

#### 1. `create-relkit` works on current Bun, with every template

**Status** Agreed · **Priority** P0 · **Effort** S · **Evidence** reproduced
([B.1](#b1-creation-refuses-any-bun-other-than-1310))

**Decision.**

- Run certification in CI, not as a check that stops users.
- Accept the Bun range that `engines` already declares (`>=1.3.10`). Warn about untested
  combinations instead of refusing them, and keep a `--strict` flag for people who want refusal.
- Enable all five templates.
- Add a nightly CI job that creates every template on the latest Bun (and on Node once #10 lands).

**Why.**

- Exactly one combination is allowed: `minimal`, no jobs, no cloud, no deploy. It is pinned to
  one release (0.8.7 when reviewed; 0.8.8 on main after the next version bump), Bun 1.3.10 exactly,
  TypeScript 5.9.3 and a hash of the package catalog
  ([create-capabilities.ts#L23](../../packages/create-relkit/src/create-capabilities.ts#L23)). The Bun
  version is read from `Bun.version`
  ([#L56](../../packages/create-relkit/src/create-capabilities.ts#L56)).
- The latest Bun on npm is 1.4.4. Calling the shipped check with a Bun 1.3.11 identity refuses with
  _"Creation combination is not certified … Supported: none for this tool identity."_ The README's
  first command therefore fails for anyone with a recent Bun. A test asserts this on purpose
  ([create-capabilities.test.ts#L34](../../packages/create-relkit/tests/create-capabilities.test.ts#L34)).
  Promising only what is tested is the right goal; refusing users when they run the command is the
  wrong way to enforce it.
- The `api`, `agent`, `fullstack` and `tasks` templates are maintained but unreachable, even on Bun
  1.3.10, while `--help` still lists them.
- Interactive creation offers only "None" for jobs, and `relkit add` cannot add a jobs provider,
  deployment, telemetry exporters, realtime channels or MCP. Those are manual edits today.

**Done when.** `bunx create-relkit@latest` succeeds for every template on the newest Bun, verified
nightly in CI.

#### 2. A "Why RelKit" page

**Status** Agreed · **Priority** P0 · **Effort** S

**Decision.** Use one positioning sentence everywhere: README, landing page, npm descriptions and the
GitHub description.

> _The TypeScript backend framework where you write the business logic. RelKit wires the APIs, jobs,
> events, agents and typed client, and gives you, and your coding agent, a live map of the app._

Add a "Why RelKit" page with honest comparisons to the closest alternatives (Encore.ts, Motia,
NestJS, and Hono with tRPC or oRPC), an FAQ, and a "Migrate from Express or Hono" guide.

**Why.**

- There are three different stories today:
  - README: "a Bun and TypeScript monorepo for generating applications whose source descriptors
    compile to one graph…"
  - Landing page: "The TypeScript Kit Framework … for agents and engineers."
  - Blog: "A TypeScript backend framework where you only write the business logic."
- The GitHub repository description is empty.
- There is no comparison page, FAQ or migration guide. Encore.ts is the closest analog
  (infrastructure from code, a local dashboard with tracing), so "why not Encore?" will be the first
  question.

**Done when.** Every public surface says the same thing, and the "Why RelKit" page exists.

#### 3. Plain language everywhere users read

**Status** Agreed · **Priority** P0 · **Effort** S–M

**Decision.** Apply five rules to the README, docs, CLI output, error messages and changelog:

1. One spelling of the name. Today the docs use "RELKIT" (~290 times), "Relkit" (~50, mostly the
   landing page and blog) and "RelKit" (a few).
2. Say what happened, then what to do next.
3. Every error has a stable `RELKIT_*` code and a link to its docs page. The diagnostic model already
   has a `documentationPath` field for this.
4. Keep internal terms out of user text: tuple, certified, readiness evidence, receipt, capsule,
   cohort, admission.
5. Changelog: one line per change, grouped into Breaking, New and Fixed; every breaking change links
   to a migration note.

**Why.**

- [README.md#L171](../../README.md#L171) says AWS/Pulumi flags "are rejected until that tuple has
  current reference-host readiness evidence" and that "deployment itself still requires explicit
  authorization". The second phrase is a rule for coding agents that leaked into user docs.
- Changelog entries are long paragraphs. The release tag `v0.7.20` matches no package version; the
  packages are at 0.8.x.
- Some facts are stale. The README says the docs are "Fumadocs-generated"
  ([README.md#L75](../../README.md#L75)), but they run on Blume. The templates README lists 3 of the 5
  templates, and the `documentation-writer` skill describes a Next.js/Fumadocs workflow.
- The README and the first error message decide whether someone keeps going, and plain, coded errors
  cut support work for people and coding agents alike.

**Examples.**

README opening:

- Before: "RELKIT is a Bun and TypeScript monorepo for generating applications whose source
  descriptors compile to one graph, local HTTP runtime, inspector protocol, and Pulumi deployment
  plan."
- After: "RelKit is a TypeScript backend framework. You write functions; RelKit turns them into HTTP
  routes, jobs, events and a typed client, and shows you a live map of your app."

Error message:

```text
Before
Creation combination is not certified: template=minimal/jobs=none/cloud=none/deploy=none/examples=on. Supported: none for this tool identity.

After (illustrative)
✖ RELKIT_RUNTIME_UNTESTED  This RelKit release hasn't been tested with Bun 1.4.4 yet.
  Creating the project anyway. Use --strict to allow only tested setups.
  Details: https://relkit.dev/errors/runtime-untested
```

Changelog entry for 0.7.12:

```md
Before: one long paragraph per change, for example "Keep ordinary backend, generic client and
testing installations free of unselected native SDKs. Selected integrations declare optional peers
and validate their actual installed versions before configuration evaluation, startup or
deployment…"

After:

## 0.7.12

### Breaking

- LangChain agent APIs moved to `@relkit/langchain`. [Migration]
- The Inspector is a separate install: run `relkit add inspector`.

### Improved

- Installing `@relkit/app` no longer pulls in AWS, Pulumi, Next.js or LangChain.
```

**Done when.** A newcomer can get from the README to a first route without meeting an unexplained
term.

#### 4. Any Standard Schema validator

**Status** Agreed · **Priority** P0 · **Effort** M · **Evidence** reproduced
([B.2](#b2-zod-4-schemas-get-no-projection-in-the-compilers-legacy-direction))

**Decision.**

- Standard Schema is the contract for function, event, task and error schemas, so Zod, ArkType,
  Effect Schema, Valibot and other compliant libraries all work.
- For the JSON Schema projection, use `~standard.jsonSchema` when the library provides it (Zod 4
  does). Otherwise use the library's own converter; Effect Schema, Valibot and ArkType each ship one.
- Recommend Zod 4 in templates and docs. Keep RelKit's own builder as a zero-dependency option, but
  rename it (for example `s`) unless it will cover Zod's commonly used API.

**Why.**

- `z` is RelKit's own hand-written validator set, not Zod. It lacks `enum`, `record`, `tuple`,
  `discriminatedUnion`, `intersection`, `lazy`, `date`, `bigint`, `coerce`, `brand`, `pipe`,
  `superRefine`, `describe`, `regex`, `url`, and object `extend`, `pick`, `omit`, `partial` and
  `strict`.
- Real Zod passes type-checking but fails compilation. Function schemas are projected in a "legacy"
  direction
  ([normalize-schema-validation.ts#L155](../../packages/compiler/src/normalize-schema-validation.ts#L155))
  that returns before consulting `~standard.jsonSchema`
  ([json-schema-inspection.ts#L31](../../packages/schema/src/json-schema-inspection.ts#L31)). Zod
  4.6.7 gets no projection in that direction, while RelKit's `z` does. Users see
  `RELKIT_SCHEMA_UNAVAILABLE`.
- The repository's agent eval shows the cost. The agent's first attempt used `z.enum`, `.trim()`,
  `.pick()`, `.omit()`, `.extend()` and `z.infer`, all unsupported
  ([contributor-fleet eval](../../tests/agent-evals/results/2026-10-20-contributor-fleet.json)).

**Trade-offs.** The legacy path probably exists to keep projections deterministic for graph hashing.
Third-party projections can change between library versions; canonicalize the JSON (sorted keys) and
treat a validator upgrade like any other dependency change. Check whether Effect 4 schemas implement
Standard Schema directly or need a wrapper.

**Done when.** The `api` template passes `relkit check` with `import { z } from "zod"`, and a test app
passes with each of Zod, ArkType, Effect Schema and Valibot.

### B. Focus and packaging

#### 5. Core and Labs; no new feature areas until 1.0

**Status** Agreed · **Priority** P0 · **Effort** M

**Decision.** Every feature is labelled Core or Labs.

- **Core** is covered by semver and the stability policy (#20), tested on every supported runtime,
  and documented as production-ready.
- **Labs** works today but may change in any release, may not run on every runtime, and is clearly
  badged.
- **No new feature areas** (descriptor kinds, provider families, integrations) until Core reaches
  1.0, apart from what this plan already includes. Bug fixes and hardening continue everywhere.

How it shows up:

- Docs: a "Labs" badge on the page and in the sidebar.
- Code: Labs APIs carry a TSDoc tag that editors show on hover.
- Packages: Labs packages say so in their README and npm description.

```ts
/**
 * Defines a realtime channel.
 * @experimental Labs: may change in any release.
 */
export function defineChannel(/* … */) {}
```

| Core                                                                      | Labs, until proven                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Functions, services, routes, and schemas from any Standard Schema library | Realtime channels and presence                                    |
| Env and config                                                            | AWS hosting through Pulumi                                        |
| Events, jobs and schedules, with local and Postgres backends              | Inngest, Trigger.dev and Effect MQ adapters                       |
| Cache and buckets                                                         | Agent adapters (#22), until the adapter interface settles         |
| Drizzle and Better Auth                                                   | Graph workflows                                                   |
| Typed client, testing, CLI, Inspector and `relkit mcp`                    | Other Pulumi targets                                              |
| Runtimes: Bun and Node LTS; Cloudflare Workers once Cloudflare ships      | Other runtimes, such as Deno, until each passes the runtime tests |
| Deploy: Docker and Railway first, then Vercel and Cloudflare              |                                                                   |
| Agent declarations, and tools as functions                                |                                                                   |

**Why.**

- 56 publishable packages and ~277k lines of framework source for one maintainer. Every feature
  multiplies the test matrix; the install evidence alone covers 84 install samples across package
  managers and project types. More runtimes and hosts make this sharper.
- Effort runs opposite to user value: the Inspector and observability are ~72k lines, while
  deployment is ~7k lines and unproven.
- Duplicates are piling up: two `defineJob`s, two `defineAgent`s, both `jobs` and `job` keys on
  `defineApp`, a 6-line `providers-standard` stub, `cloud-aws` (described in its own package as
  "Unsupported internal"), and three separate AWS request-signing (SigV4) implementations.

**Done when.** A public Core/Labs table exists, and every Labs page and README carries a badge.

#### 6. `relkit` for the core, `@relkit/*` for integrations and tools, one version

**Status** Agreed with changes: the `relkit` and `@relkit/*` split is the maintainer's proposal ·
**Priority** P1 · **Effort** M–L

**Decision.**

- **`relkit` is the core package.** It holds everything an app imports at run time: functions,
  services, routes, events, jobs, cache, buckets, schemas, config, agent declarations and the
  runtime. It offers a root import plus focused subpaths (`relkit/functions`, `relkit/events`, …).
  It keeps the `relkit` command as a thin launcher that runs the project's `@relkit/cli`, so
  production installs don't pull in the compiler.
- **`@relkit/*` holds everything optional:**
  - third-party integrations, such as `@relkit/better-auth`, `@relkit/drizzle`, `@relkit/redis`,
    `@relkit/s3` and `@relkit/langchain`, plus new ones such as `@relkit/postgres` and
    `@relkit/railway`;
  - first-party tools that don't belong in a production install: `@relkit/cli`, `@relkit/client`,
    `@relkit/testing` and `@relkit/inspector`.
- `create-relkit` stays the project creator.
- **One version** for `relkit`, `create-relkit` and every `@relkit/*` package, using a Changesets
  `fixed` group.
- **One breaking release** (decided in round 3). `@relkit/app` becomes `relkit` in the same release
  as the API changes in section E, with one codemod and one migration guide. Publish a final
  `@relkit/app` that re-exports `relkit` and is marked deprecated on npm.

**Why the naming works.** It is the convention developers already know from Hono (`hono` and
`@hono/*`), Astro (`astro` and `@astrojs/*`) and Effect (`effect` and `@effect/*`): one short import
for the core, and a scope for everything you opt into. Putting the first-party optional tools under
`@relkit/*` as well keeps `relkit` exactly "what a production server needs".

**Why one version.**

- [.changeset/config.json](../../.changeset/config.json) has `fixed: []` and `linked: []`. Today
  `@relkit/app` is 0.8.4 on npm, the CLI 0.8.7, the Inspector 0.2.0 and the LangChain package 0.7.14.
  The GitHub release is `v0.7.20`, and RELEASE_NOTES is titled "RelKit 0.7.19" while listing CLI
  0.8.7.
- Users cannot answer "which RelKit am I on?", which is why `doctor` has to check whether installed
  versions work together.
- The README says unsupported internals are published "only so workspace dependencies remain
  resolvable".

**Examples.**

```ts
// Today
import { defineFunction } from "@relkit/app/functions";
import { defineService } from "@relkit/app/services";
import { defineBetterAuthService } from "@relkit/better-auth";

// Proposed
import { defineFunction, defineService } from "relkit"; // core
import { defineBetterAuthService } from "@relkit/better-auth"; // integration
```

```jsonc
// A generated app's package.json, proposed
"dependencies": { "relkit": "0.9.0", "@relkit/better-auth": "0.9.0" },
"devDependencies": { "@relkit/cli": "0.9.0", "@relkit/testing": "0.9.0" }
```

```jsonc
// .changeset/config.json, proposed
{ "fixed": [["relkit", "create-relkit", "@relkit/*"]] }
```

A starting package map. The exact boundaries should follow the dependency graph.

| Package             | Absorbs today's                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relkit`            | app, agents, buckets, cache, config, contracts, diagnostics, events, functions, invocation, jobs, realtime, routes, schema, services, tools; the runtime (engine, runtime-effect, runtime-hono, provider, providers-local, local-service, observability, openapi); the `relkit` launcher |
| `@relkit/cli`       | cli, compiler, graph, client-generator, supervisor, deploy, deploy-pulumi                                                                                                                                                                                                                |
| `@relkit/client`    | client                                                                                                                                                                                                                                                                                   |
| `@relkit/testing`   | testing                                                                                                                                                                                                                                                                                  |
| `@relkit/inspector` | inspector, inspector-api, observability-local                                                                                                                                                                                                                                            |
| `create-relkit`     | Unchanged                                                                                                                                                                                                                                                                                |
| Integrations        | better-auth, drizzle and the 13 integrations, plus new ones such as Postgres, Railway, Vercel and an AI SDK adapter                                                                                                                                                                      |
| Removed             | providers-standard (a stub), cloud-aws (folded into `@relkit/aws`), the integration catalog (folded into `create-relkit`)                                                                                                                                                                |

**Trade-offs.** Every release bumps every package, even unchanged ones. The rename is a breaking
change for current users; the codemod and the deprecated re-export soften it, and there are no
outside users yet, so now is the cheapest time.

**Done when.** An app depends on `relkit` plus only the integrations and tools it uses; everything
shares one version; and the 42 framework packages become five (`relkit`, `@relkit/cli`,
`@relkit/client`, `@relkit/testing`, `@relkit/inspector`) plus `create-relkit`.

#### 7. Right-size process, evidence and repository hygiene

**Status** Agreed · **Priority** P1 · **Effort** S–M

**Decision.**

| Keep                                                                        | Change                                                                                                                                                               | Remove                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ADRs for lasting architecture decisions                                     | Use OpenSpec only for new public APIs or descriptor kinds, breaking changes, new provider families, graph or protocol format changes, and security-sensitive changes | Committed raw evidence JSON (~196 MB in `docs/evidence`)                                                               |
| OpenSpec, for the cases in the next column                                  | Keep evidence in CI artifacts and files attached to each GitHub release; the repo keeps a short summary per release                                                  | The 1,661 committed bug-fix report files; link the GitHub issue instead                                                |
| Strict CI gates: types, tests, packed smoke tests, mutation testing on jobs | Turn every rule that agents must follow into a check in `prepush` or CI, not prose                                                                                   | Machine-specific paths (767 files) and the personal-path skill in AGENTS.md; vendor `use-effect` into `.agents/skills` |
| Agent evals                                                                 | Run them in CI for each release and publish the pass rate                                                                                                            | Vendored skills that don't apply, such as `radix-base-ui-sync`                                                         |
|                                                                             | Start CONTRIBUTING with a short quickstart, and move release certification to a maintainer doc                                                                       |                                                                                                                        |

**Why.**

- Generated material dominates the repository: `docs/` is ~196 MB (mostly evidence JSON),
  `openspec/` is ~433k lines, 1,661 bug-fix report files are committed, and 767 committed files
  contain `/Users/<name>/...` paths.
- [AGENTS.md#L119](../../AGENTS.md#L119) requires a skill stored at a personal path that no
  contributor, or their agent, can read.
- 28 of the 31 skills in `.agents/skills` are vendored from other projects, and some target code that
  doesn't exist here.
- CONTRIBUTING is mostly release-certification internals.
- This rigor clearly keeps coding agents honest, and that value is worth keeping. Encode it as checks
  that people and agents both run, not as prose and evidence files.

**Examples.**

```sh
# Contributor quickstart
git clone https://github.com/rel-kit/relkit && cd relkit
bun install --frozen-lockfile
bun run build
bun run test:unit   # fast loop
bun run prepush     # what CI runs; use it before opening a PR
```

```md
<!-- docs/evidence/0.9.0.md: the only evidence kept in the repo (numbers are illustrative) -->

# 0.9.0 release evidence

- Dev startup, minimal app, Linux CI: p50 0.9 s, p95 1.0 s
- Packed install smoke tests: Bun, npm and pnpm pass
- Agent evals: 3 of 3 pass
- Full reports: release asset `evidence-0.9.0.zip`
```

**Done when.** A newcomer can contribute using only CONTRIBUTING, and `docs/` is under 5 MB.

#### 8. Pre-release dependency policy

**Status** Agreed in round 5 · **Priority** P2 · **Effort** S

**Decision.** Track pre-release and patched dependencies as explicit debt, prefer stable lines for
anything that ends up in users' `node_modules`, and upstream local patches.

**Why.**

- Pre-release pins reach users:
  - oRPC `2.0.0-beta.31` in `@relkit/runtime-hono` and `@relkit/client`, plus a
    `@orpc/tanstack-query@2.0.0-beta.31` peer (the stable oRPC line is 1.x);
  - `drizzle-orm` `1.0.0-rc.5-169397b` as the peer of `@relkit/drizzle`, with a local patch (the
    stable line is 0.45.x).
- Apps that also use Drizzle or oRPC directly will hit version conflicts.
- Three dependencies are patched in the repository: `blume`, `@effect/docgen` and `drizzle-orm`.
- Pins lag behind: Effect 4.0.1 (4.1.2 available), Hono 4.13.7 (4.13.16), Better Auth 1.7.1
  (1.7.15).
- The breaking release (roadmap phase 2) and the runtime work in #10 touch the same dependencies, so
  settling the policy now saves rework.

**Done when.** A short dependency-policy section exists, and every pre-release pin has an owner and an
exit plan.

### C. Reach every TypeScript developer

#### 9. Fast, incremental dev loop with published budgets

**Status** Agreed · **Priority** P1 · **Effort** L

**Decision.** Treat reload time and memory as product features, with CI budgets for apps of 10, 100
and 500 functions.

Today, on every save:

```text
fork a compiler → import every module in a fresh child process → type-check the whole project
→ bun build → start a new server process → health check → switch traffic
```

Proposed:

```text
save → re-import only the changed modules in a warm process → swap the handlers
     → type errors arrive in parallel from tsc --watch or the editor, without blocking the reload
config or provider change → full restart, as today
```

- Keep the module evaluator running and re-evaluate only changed modules.
  `invalidateWatchDependencies` already exists but has no callers
  ([watch.ts#L135](../../packages/compiler/src/watch.ts#L135)).
- Take full type-checking off the save path, and skip `bun build` in dev.
- Once the general path is fast, retire the special fast-start cache (`dev-snapshot`, ~7.7k lines).

| App size      | Save to serving, p95 | `relkit check` peak memory |
| ------------- | -------------------- | -------------------------- |
| 10 functions  | Under 300 ms         | At or below `tsc`          |
| 100 functions | Under 1 s            | At or below `tsc`          |
| 500 functions | Under 2 s            | Under 1.5 × `tsc`          |

(Illustrative targets.)

**Why.**

- A one-route app takes about 1 s to its first response on Linux CI. The 0.8.7 restart run missed its
  own 1-second target (p95 1,103 ms), after which the target was made advisory. There are no numbers
  for larger apps.
- In the agent evals ([summary](../../tests/agent-evals/results/2026-10-20-domain-services.md)),
  `relkit check` on small apps exceeded memory limits of 768 MB, 1 GB and 1.28 GB, while plain `tsc`
  peaked at ~570–630 MB.
- The fast-start path depends on hand-written lists of code patterns known to be safe. For example,
  only the `baseURL` and `emailAndPassword` Better Auth options qualify
  ([snapshot-commerce-eligibility.ts](../../packages/cli/src/dev-snapshot/snapshot-commerce-eligibility.ts));
  anything else falls back to the slow path.

**Trade-offs.** In-process reloading risks stale module state; keep today's blue/green restart as the
fallback for config and provider changes.

**Done when.** A public benchmarks page tracks reload time and memory at three app sizes on every
release.

#### 10. Bun, Node and other stable runtimes, in tiers

**Status** Agreed with changes: widened from Node to all stable runtimes · **Priority** P1 ·
**Effort** M–L

**Decision.**

| Tier | Runtimes                  | What runs                            | Tested                                      |
| ---- | ------------------------- | ------------------------------------ | ------------------------------------------- |
| 1    | Bun and Node LTS (22, 24) | Everything                           | Every release                               |
| 2    | Cloudflare Workers        | HTTP, with external durable backends | Every release, once Cloudflare deploys ship |
| Labs | Deno and other runtimes   | HTTP                                 | Until each passes the runtime tests         |

Order: the production server on Node first; then the CLI and `create` on Node; then Workers (needed
for Cloudflare); then the rest. Each runtime gets a small adapter (serving, files, crypto) and a CI
job. Bun stays the recommended and fastest path.

**Why.**

- Bun-only rules out most teams: companies standardized on Node, Vercel functions, and Node-only
  monitoring tools.
- The core is already portable. The engine, invocation, runtime-effect, jobs, events and realtime
  packages make no Bun-specific calls.
- The coupling sits at the edges:
  - the generated server uses `Bun.serve`, is bundled with `--target=bun` and ships on a pinned
    `oven/bun:1.3.10` image;
  - static files use `Bun.file`;
  - Redis uses `Bun.RedisClient`;
  - Sentry uses `@sentry/bun`;
  - SQLite uses `bun:sqlite`;
  - the dev supervisor has workarounds specific to Bun 1.3.10.
- Every package except the Inspector declares only a Bun engine.

**Trade-offs.** More runtimes mean more CI. Starting with the production server limits that cost to
the code adopters care about most.

**Done when.** The `api` template's production build passes the same HTTP tests on Bun and Node LTS
in CI, and an HTTP-only app passes on Workers.

#### 11. TypeScript 7, including RelKit's own codebase

**Status** Agreed with changes: RelKit's own codebase moves to TypeScript 7 too · **Priority** P1 ·
**Effort** M

**Decision.**

- **For users:** every RelKit type guarantee works through plain `tsc` using generated declaration
  files; the editor plugin is optional; TypeScript 7 joins the user-project CI matrix.
- **For RelKit itself:** type-check and build the monorepo with TypeScript 7. Where RelKit calls the
  TypeScript 5 JavaScript API, keep `typescript@5.9` as a private dependency until TypeScript 7
  covers those calls, or move parsing to another parser. `relkit check` runs the user's own `tsc` as
  a separate process.

**Why.**

- `typescript@latest` on npm is 7.0.2, the native compiler. RelKit pins 5.9.3 and depends on the 5.x
  JavaScript API:
  - `ts.createProgram` for type-checking
    ([project-typecheck.ts#L25](../../packages/compiler/src/project-typecheck.ts#L25));
  - 15 `ts.createSourceFile` call sites in code editing and the dev fast-start path;
  - a tsserver plugin ([editor.ts](../../packages/cli/src/editor.ts)).
- The docs generator may depend on the 5.x API too. Confirm what TypeScript 7 supports; every gap is
  something users on TypeScript 7 lose.
- The plugin's only quick fix undoes a mistake that `defineServiceRoutes` invites (not destructuring
  its result). That is better fixed in the API (#15).

**Done when.** An app on `typescript@7` type-checks, `relkit check` and `relkit add` work, and the
RelKit repository type-checks with TypeScript 7 in CI.

### D. Production

#### 12. Self-hosting first with durable backends; Railway, then Vercel, then Cloudflare

**Status** Agreed with changes: Railway first, then Vercel and Cloudflare; Dockerfile generation;
Pulumi-supported targets · **Priority** P1 · **Effort** M–L

**Decision.**

1. **A Docker image you can run anywhere.** `relkit build` already writes a Dockerfile. Make it a
   documented, tested, production-ready output, and add `relkit deploy init <target>` to generate
   each target's files.
2. **Durable backends.** Add a Postgres backend for jobs, events and schedules (the Effect MQ adapter
   already runs jobs on Postgres), with a transactional outbox so events commit atomically with
   business writes. Each schedule occurrence runs once, however many instances are running.
3. **Railway first.** Railway runs containers, so it uses the Docker path: generate `railway.json`,
   document Railway Postgres as the durable backend, and add a "Deploy on Railway" guide.
4. **Then Vercel**, after Node support. Vercel runs Node functions with no long-lived process:
   schedules use Vercel Cron, jobs and events use the Postgres backend (or Inngest or Trigger.dev),
   and WebSocket realtime needs an external provider.
5. **Then Cloudflare**, after the Workers adapter. Use Queues for jobs and events, Cron Triggers for
   schedules and Durable Objects for realtime; R2 and KV adapters already exist.
6. **Pulumi where it fits.** Use Pulumi for targets with a maintained provider; otherwise generate the
   platform's own config (`railway.json`, `vercel.json`, `wrangler.jsonc`) and use its CLI. AWS stays
   in Labs until it builds and pushes images, serves HTTPS, runs more than one task and passes a real
   deploy test.

**Why.**

- Durable events have one backend, `local-event`, a filesystem store
  ([providers.ts#L42](../../integrations/packages/local/src/providers.ts#L42)). The production image
  keeps that state inside the container
  ([build-container.ts#L24](../../packages/cli/src/commands/build-container.ts#L24)), so events are
  lost on redeploy and not shared between instances. SQS and EventBridge code exists only in the
  unsupported `cloud-aws` package.
- Scheduled jobs are triggered inside the web process
  ([build-server-runtime-support.ts#L82](../../packages/cli/src/commands/build-server-runtime-support.ts#L82)),
  and a scheduled enqueue carries no per-occurrence identity. With the built-in backend, two
  instances each run every schedule.
- The AWS host has several gaps:
  - plain HTTP on port 80 with a single task
    ([service.ts#L88](../../integrations/packages/aws/src/host/service.ts#L88),
    [#L120](../../integrations/packages/aws/src/host/service.ts#L120));
  - public subnets with public IPs;
  - the `latest` image tag ([from-graph-plan.ts#L81](../../packages/deploy/src/from-graph-plan.ts#L81)),
    with nothing that builds or pushes the image;
  - the last recorded AWS lifecycle run timed out and was waived
    ([RELEASE_CHECKLIST.md#L5](../../RELEASE_CHECKLIST.md#L5)).
- The docs card "Run a built Bun server" links into the AWS page
  ([deployment/index.mdx](../../apps/docs/content/docs/modules/deployment/index.mdx)).

**Trade-offs.** A Postgres queue and event store is real work. Wrapping an existing Postgres queue
library behind the provider interface is a valid shortcut.

**Done when.** A newcomer deploys the `api` template to Railway in 15 minutes, and jobs, events and
schedules behave correctly across a restart and with two instances. Then the same for Vercel, then
Cloudflare.

#### 13. Finish the HTTP and auth model, including a plain Better Auth file

**Status** Agreed with changes: part (g), a plain Better Auth file, is the maintainer's proposal ·
**Priority** P1 · **Effort** M

**Decision.** Seven parts.

**a) One error format.** Today responses use at least five shapes:

```jsonc
// Declared error
{ "kind": "application", "outcome": "declared-error", "code": "orders.not-found", "message": "Order ord_123 was not found", "data": { "orderId": "ord_123" }, "status": 404, "retry": "later" }
// Validation
{ "error": "validation", "issues": [{ "code": "…", "message": "…", "path": ["quantity"] }] }
// Rate limit
{ "error": "rate-limit", "retryAfterMs": 1000 }
// Unexpected
{ "error": "internal-error" }
// Not signed in
{ "error": { "id": "UNAUTHORIZED", "message": "Authentication required" } }
```

Proposed: RFC 9457 Problem Details for every error. Validation errors use the same shape, with
`"code": "validation"` and an `issues` array.

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{
  "type": "/errors/orders.not-found",
  "title": "Order not found",
  "status": 404,
  "code": "orders.not-found",
  "detail": "Order ord_123 was not found",
  "data": { "orderId": "ord_123" },
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

Every client parses one shape, standard tooling understands it, and the trace id links a user's bug
report to its trace in the Inspector.

**b) Throwing declared errors.** Today the types require every declared error to be returned
([handler-result.types.ts#L108](../../packages/functions/src/handler-result.types.ts#L108)), unlike
Hono's `HTTPException`, tRPC's `TRPCError` or NestJS exceptions. An undeclared error becomes a
generic 500.

```ts
// Today
if (!order) return new orderNotFound({ orderId }); // or: return fail(orderNotFound, { orderId })

// Proposed: throwing type-checks too, and returning keeps working
if (!order) throw new orderNotFound({ orderId });
```

The "every declared error is handled" check becomes an optional lint rule.

**c) Status, headers and cookies, set on the route.** Outside raw routes, handlers can't set headers,
cookies or a dynamic status today
([http-dsl.types.ts#L65](../../packages/routes/src/http-dsl.types.ts#L65)). Setting them on the route
keeps functions transport-neutral, so jobs, tools and agents can still call them.

```ts
export const POST = defineRoute({
  target: orders.createOrder,
  successStatus: 201, // exists today
  // proposed:
  response: ({ output }) => ({
    headers: { Location: `/orders/${output.orderId}` },
    cookies: [{ name: "last_order", value: output.orderId, httpOnly: true, sameSite: "lax" }],
  }),
});
```

**d) Authentication on the route, authorization on the function.** Function routes have no auth
option today ([route.types.ts#L31](../../packages/routes/src/route.types.ts#L31)); protection is a
list of path patterns on the Better Auth mount, and there are no roles or permissions, although the
original brief listed organizations, teams, roles and policies as MVP.

```ts
// Today
export const ALL = defineRoute({
  handler: auth.handler,
  auth: { protected: ["/account/*", "/mcp"] },
});
```

```ts
// Proposed: authentication where the route is defined (401 when signed out)
export const GET = defineRoute({ target: account.getProfile, auth: "required" });

// Proposed: authorization on the function, enforced for HTTP, jobs, tools, agents and MCP alike
export const cancelOrder = defineFunction({
  input,
  output,
  access: { roles: ["admin"] }, // 403 otherwise; roles come from Better Auth organizations
  // or: access: ({ session, input }) => session.user.id === input.ownerId,
  handler: async (input, ctx) => {
    /* … */
  },
});
```

Security sits next to the code it protects, appears in the graph, in OpenAPI (`security`) and in the
Inspector, and can't be skipped by calling the function from another trigger.

**e) Middleware that passes typed data on.** Today middleware is typed with Hono's `Context`,
matched by path pattern, and can block a request but not pass typed data on.

```ts
// Today
const orderAuth = defineMiddleware("/orders/*", async (context, next) => {
  /* … */
  await next();
});
```

```ts
// Proposed: middleware declares what it provides, and routes map it into the function input
const tenant = defineMiddleware({
  path: "/orders/*",
  provides: z.object({ tenantId: z.string() }),
  handler: async (request) => ({ tenantId: request.headers.get("x-tenant-id") ?? "public" }),
});

export const GET = defineRoute({
  target: orders.listOrders,
  request: http.input({ tenantId: http.from(tenant, "tenantId") }),
});
```

**f) More than one database.** `context.database` is typed for a single Drizzle service today
([context-registry.ts#L27](../../packages/compiler/src/context-registry.ts#L27)). Proposed:
`context.databases.<service>` for each one, with `context.database` kept as the default.

**g) A plain Better Auth file.** Users write auth exactly as Better Auth's docs show, in its own file,
and hand it to RelKit.

```ts
// src/services/auth/auth.ts: exactly what Better Auth's docs show
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
```

```ts
// src/services/auth/service.ts: hand it to RelKit (proposed)
import { defineBetterAuthService } from "@relkit/better-auth";
import { auth } from "./auth";

export default defineBetterAuthService({ auth });
```

My view: agree, and make it the default way to set up auth. It's familiar, people can paste straight
from Better Auth's docs and plugins, and it shrinks RelKit's own API. What RelKit does with the
file:

- **Database.** If the file leaves `database` out, RelKit plugs in the app's Drizzle database when the
  app starts, so auth tables live in your normal migrations and share transactions. If the file sets
  `database`, RelKit uses it as-is and you own those tables; Better Auth's CLI works on the file in
  that case.
- **Mounting.** RelKit serves Better Auth's handler at its `basePath` (default `/api/auth`), so the
  catch-all route file is no longer needed. The route still appears in the graph and OpenAPI as part
  of the auth service. Offer `mount: false` for people who want their own route file; this is the
  one deliberate exception to "routes come from `src/routes`".
- **Types.** `context.auth` is typed from `auth.$Infer.Session`, so plugin fields such as
  organization and role reach handlers and `access` rules (d).
- **Secrets.** `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are declared in `defineEnv`, so a missing
  secret fails at startup with a clear error.
- **Protection** moves from path lists on the auth mount to `auth: "required"` on routes and `access`
  on functions (d).

Implementation notes:

- Today RelKit deliberately never constructs Better Auth during `check`: `defineBetterAuthService`
  takes options, rejects `database` and `basePath`
  ([index.ts#L48](../../packages/better-auth/src/index.ts#L48)), and builds the instance at startup.
  With a plain file, the instance is constructed whenever the file is imported, including during
  `check`.
- That is workable. Without `database`, Better Auth 1.7.1 falls back to an in-memory adapter, so
  importing the file is cheap and offline. Verify that it starts no timers or network calls the
  `check` sandbox would reject.
- At startup, RelKit builds the instance it actually serves from `auth.options` (every Better Auth
  instance exposes its options), adding the database and base path when they're missing.

**Done when.** The "protect orders" tutorial protects a route with one line on that route; every
error response validates against one schema; and the auth guide starts from a plain Better Auth
file.

### E. One coherent API

**Is this internal?** No. Most of #14, #15 and #16 changes what users write.

**Decided in round 3:** these changes ship together with the `relkit` rename (#6) and the breaking
parts of #13 as one release, with one codemod and one migration guide. Now, while there are no
outside users, is the cheapest time. Because the release is large, publish it as a beta first and
migrate the examples and templates with the codemod before the final release.

What the release changes. Rows marked "No" are additive and can also ship before or after it.

| Change                                                                                              | Who notices                                                                               | Breaking?                                                  |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `relkit` for the core and `@relkit/*` for the rest, on one version (#6)                             | Everyone                                                                                  | Yes; the codemod rewrites imports and package names        |
| One error format (#13 a)                                                                            | Clients that read error bodies                                                            | Yes                                                        |
| Route-level `auth: "required"` replaces the protected-path list (#13 d)                             | Apps that protect routes                                                                  | Yes; the codemod moves the list onto the routes            |
| The plain Better Auth file (#13 g)                                                                  | Apps using `defineBetterAuthService(options)`                                             | Yes; the codemod moves the options into a Better Auth file |
| The main entry point drops `*Effect` and `*Live` exports; Effect helpers move to `relkit/effect`    | Only people importing those names                                                         | Yes, for them                                              |
| Handlers that return an Effect                                                                      | Nobody; they keep working                                                                 | No                                                         |
| Dependencies declared once and called through `ctx`                                                 | Everyone calling `x.invoke()` or `channel.trigger()` inside handlers                      | Yes; the codemod handles it                                |
| `getRelkit()` and `createRelkit()` for outside-handler access                                       | Everyone who wants it                                                                     | No; new API                                                |
| One ID rule                                                                                         | Apps with inferred error IDs                                                              | Yes; the codemod adds IDs                                  |
| Removing duplicates and aliases                                                                     | Users of the legacy `defineJob`, the second `defineAgent`, the `job` key, and the aliases | Yes                                                        |
| A `defineServiceRoutes` shape that needs no destructuring                                           | Users of `defineServiceRoutes`                                                            | Yes                                                        |
| The typed client's new call style, such as `useRoute(api.orders.list)` (#16)                        | Frontends using `@relkit/client`                                                          | Yes; the codemod handles it                                |
| The client switches from RPC to REST under the hood (#16)                                           | Nobody; user code doesn't change                                                          | No; can follow later                                       |
| Throwing declared errors, route response options, typed middleware, more databases (#13 b, c, e, f) | People who want them                                                                      | No; additive                                               |
| Function `access` rules (#13 d)                                                                     | People who want them                                                                      | No; additive                                               |
| No published `internal/*` paths                                                                     | Only people importing internals                                                           | Yes, for them                                              |
| Compiler, engine and packaging work behind all of this                                              | Nobody                                                                                    | Internal                                                   |

#### 14. A Promise-first API that still runs Effect code

**Status** Agreed · **Priority** P1 · **Effort** M

**Decision.** Following the maintainer's answer: Effect stays internal, and Effect code written by
users keeps working.

```ts
// Default: a plain async handler
export const getOrder = defineFunction({
  input,
  output,
  errors: [orderNotFound],
  handler: async (input, ctx) => {
    const order = await ctx.database.orders.findOne({ where: { id: input.orderId } });
    if (!order) return new orderNotFound({ orderId: input.orderId });
    return order;
  },
});
```

```ts
// Effect users: return an Effect. It gets the same cancellation, tracing and error mapping.
// This works today; keep it working and document it.
import { Effect } from "effect";

export const getOrder = defineFunction({
  input,
  output,
  errors: [orderNotFound],
  handler: (input, ctx) =>
    Effect.gen(function* () {
      const order = yield* Effect.tryPromise(() =>
        ctx.database.orders.findOne({ where: { id: input.orderId } }),
      );
      if (!order) return yield* Effect.fail(new orderNotFound({ orderId: input.orderId }));
      return order;
    }),
});
```

```ts
// What changes: the main entry point is Promise-only, and Effect helpers are opt-in
import { defineFunction } from "relkit";
import { failEffect } from "relkit/effect";
```

Generated apps also stop needing `effect` as a direct dependency.

**Why.**

- ADR-002 says there is no Effect in public APIs or generated apps. In practice:
  - the `@relkit/app` root exposes 598 runtime exports, including 206 `*Effect` functions and 15
    `*Live` layers;
  - handlers may return Effects (keep this);
  - 86 of the 176 public type-declaration files in `@relkit/jobs` import `effect`;
  - the check that kept Effect out of public types was relaxed
    ([check-public-declarations.ts#L25](../../scripts/check-public-declarations.ts#L25)).
- The generated `runtime-integrations.ts` imports `effect`, which is why every app lists it as a
  dependency. The client package also has a runtime `effect` dependency.
- 53% of framework source files import Effect. That is fine as a deliberate requirement for
  contributors, and costly as an accident.

**Done when.** The root export list fits on one docs page, and a new app has no direct `effect`
dependency.

#### 15. One way to do each thing, including access outside handlers

**Status** Agreed with changes: access outside handlers is the maintainer's requirement ·
**Priority** P1 · **Effort** M

**Decision.**

Today a handler reaches its dependencies four different ways:

```ts
handler: async (input, ctx) => {
  await ctx.cache.prices.get(input.sku); // declared in `dependencies`, read from ctx
  const { totalCents } = await priceOrder.invoke({ quantity: input.quantity }); // imported, .invoke()
  await announcements.trigger({}, "posted", { message: "New order" }); // imported, .trigger()
  await ctx.events.orderCreated.publish({ orderId: input.orderId }); // listed in `publishes`
},
```

Proposed: declare once, and call through `ctx`.

```ts
export const createOrder = defineFunction({
  input,
  output,
  dependencies: {
    functions: { priceOrder },
    cache: { prices },
    events: { orderCreated },
    channels: { announcements },
  },
  handler: async (input, ctx) => {
    const { totalCents } = await ctx.functions.priceOrder({ quantity: input.quantity });
    await ctx.cache.prices.set(input.sku, totalCents);
    await ctx.events.orderCreated.publish({ orderId: input.orderId });
    await ctx.channels.announcements.trigger({}, "posted", { message: "New order" });
    return { ...input, totalCents };
  },
});
```

Outside handlers, the same clients come from a runtime handle:

```ts
// Inside the running app, outside a handler: raw routes, middleware, startup hooks
import { getRelkit } from "relkit";

const relkit = getRelkit();
const recent = await relkit.database.orders.findMany({ limit: 10 });
```

```ts
// Scripts, seeders, workers, or another framework such as Next.js server actions
import { createRelkit } from "relkit";
import config from "./relkit.config";

const relkit = await createRelkit(config); // starts only the providers the graph needs
const quote = await relkit.functions.orders.priceOrder({ quantity: 3 });
const reply = await relkit.agents.hello.assistant({ message: "Hi" });
await relkit.events.orderCreated.publish({ orderId: "ord_1" });
await relkit.close();
```

Rules for calls from outside handlers:

- They get the same validation, retries, telemetry and access rules as calls inside handlers. The
  Inspector shows them as `system` calls.
- To act as a user, so access rules apply to that user: `relkit.as(session).functions…`.
- `getRelkit()` fails with a clear error when no app is running; `createRelkit()` is the explicit way
  to start one.

The rest of the pass:

- **One rule for IDs.** Today `id` is optional for functions, services, routes and errors, and
  required for events, buckets, caches, channels and tasks. Keep "durable or public things need an
  explicit ID", but apply it everywhere it matters. A declared error's ID becomes its public `code`
  in API responses, so an inferred error ID changes the API when the file moves.
- **No duplicates or aliases.** One `defineJob`, one `defineAgent`, one `jobs` key, and no
  `getJsonSchema`/`toJsonSchema`, `z.void`/`z.undefined` or `defineTransform`/`defineRequestTransform`
  pairs.
- **No easy misuse.** A `defineServiceRoutes` shape that doesn't need destructuring.
- **No internals in public exports.** No published `internal/*` subpaths.

**Why.** Each inconsistency is something a person or an agent has to memorize. Together they make the
598-export surface feel larger than it is, and scripts, raw routes and other frameworks can't reach
the database, functions or agents at all today.

**Done when.** The concept pages describe one pattern per concept with no "or" alternatives, and a
seed script uses the database, functions and agents through `createRelkit`.

#### 16. One wire protocol and a leaner typed client

**Status** Agreed · **Priority** P1 for the new call style, which ships in the one breaking release;
P2 for the switch to REST under the hood, which doesn't change user code · **Effort** M

**Decision.** Today the typed client and everyone else use different protocols:

- your frontend, through `@relkit/client`, calls oRPC's RPC endpoint under `/rpc`
  ([transport-native.ts#L20](../../packages/client/src/transport-native.ts#L20));
- curl, mobile apps, other languages and OpenAPI tools call the REST routes, such as `GET /orders`.

So every function has two public wire formats. The typed client should call the same REST routes the
OpenAPI document describes, so there is one contract. Alongside that:

- property-style calls (`api.orders.get(...)`) alongside the hooks;
- typed error codes;
- no `effect` in the browser bundle;
- API changes picked up without restarting the frontend;
- a fresh clone that type-checks after `bun install` (today the template's `tsconfig.json` lists
  generated files under `.relkit/`, which `.gitignore` excludes:
  [tsconfig.json#L22](../../templates/default/v1/api/tsconfig.json#L22));
- a plan to move off the oRPC 2.0 beta.

```tsx
// Today
const orders = useRoute("GET /orders", { input: {} }); // sent as an RPC call under /rpc
const post = useRouteMutation("POST /announcements");
post.error; // error data only, with no `code` to branch on
// After the backend's API changes, the frontend dev server must restart
```

```tsx
// Proposed
const orders = useRoute(api.orders.list, { input: {} }); // sent as GET /orders, like curl and OpenAPI
const post = useRouteMutation(api.announcements.post);
if (post.error?.code === "announcements.too-long") {
  /* … */
}
const order = await api.orders.get({ orderId: "ord_1" }); // GET /orders/ord_1, in a browser or on a server
```

**Why.** One contract to secure, version, cache and debug; anything the browser does, curl can
reproduce. It also suits teams with non-TypeScript clients, part of the "both" persona.

**Trade-offs.** oRPC's RPC format carries richer types than plain JSON: dates, big integers, files
and streams. The REST path has to encode those. oRPC has an OpenAPI-based mode that may cover this;
evaluate it before building your own.

**Done when.** The browser's network tab shows the URLs the OpenAPI document lists, and a fresh clone
type-checks after `bun install`.

### F. Agents, ecosystem and community

#### 22. Agents run through adapters, LangChain first

**Status** Agreed (new item) · **Priority** P2 · **Effort** M

**Decision.** RelKit owns the agent model. LangChain becomes the first adapter, and the Vercel AI SDK
the second.

```ts
// Today: the agent is built from LangChain objects
import { defineAgent } from "@relkit/langchain";
import { todoListMiddleware } from "langchain";

export default defineAgent({
  id: "hello.assistant",
  input,
  output,
  model: languageModel, // a LangChain model instance
  instructions: "Answer greeting questions with the available tools.",
  tools: [lookup, uppercase], // a RelKit tool and a LangChain tool
  middleware: [todoListMiddleware()], // LangChain middleware
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
```

```ts
// Proposed: a RelKit agent, run by the adapter you choose
import { defineAgent } from "relkit";
import { langchain } from "@relkit/langchain"; // or an AI SDK adapter

export default defineAgent({
  id: "hello.assistant",
  input,
  output,
  model: "default", // a model profile bound in relkit.config.ts
  instructions: "Answer greeting questions with the available tools.",
  tools: [lookup], // RelKit tools work with every adapter
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
  runtime: langchain({ middleware: [todoListMiddleware()] }), // SDK-specific extras stay here
});
```

Order:

1. Define the adapter interface from what the LangChain integration needs today.
2. Move the LangChain integration onto it.
3. Add the AI SDK adapter.
4. Share one conformance suite across adapters (fits #19).

Graph workflows stay in Labs until the interface settles.

**Why.**

- RelKit's AI value is not the agent loop. It is tools that are validated functions, auth and
  policies on tool calls, durable threads, approvals, streaming to clients, MCP and Inspector traces.
  None of that depends on one SDK.
- The TypeScript agent ecosystem changes quickly, and teams already have favourites.
- RelKit is halfway there: `@relkit/agents` already has SDK-free `defineAgent` declarations, and the
  engine already expects a `model` capability. The LangChain work (~13k lines, ~200 tests) becomes
  the first adapter instead of being thrown away.

**Trade-offs.** The portable part covers the common case. Advanced SDK features stay available
through the adapter's options, but agents that use them are tied to that adapter.

**Done when.** The same agent definition runs on the LangChain and AI SDK adapters and passes the
shared conformance suite.

#### 18. `relkit mcp`, also working with the MCP Inspector

**Status** Agreed with changes: MCP Inspector support added · **Priority** P1 · **Effort** M

**Decision.** Make agent-assisted development the thing RelKit is known for. Ship a dev-only MCP
server built on the existing Inspector API: bound to localhost, using the same token as the Inspector
bridge, and never included in production builds. Through it, an agent can:

- query the graph and read diagnostics;
- pull the logs and trace for a request;
- invoke a function;
- run `check`, and run `add` with rollback.

Also:

- **MCP Inspector.** The app's `/mcp` endpoint is already tested with the MCP Inspector CLI
  (`bun run test:mcp:inspector`). Run the same test against `relkit mcp`, and document
  `npx @modelcontextprotocol/inspector` for both. In RelKit's own Inspector, add a page that lists
  MCP-exposed tools and can call them.
- Close the Inspector's action gaps: event publish and replay, and job trigger. The API already has
  event retry and cancel, but the UI does not.
- Consider MCP elicitation for tools that need approval, instead of returning an error.
- Run the existing agent evals on every release and publish the pass rate.

**Why.**

- The hard parts exist: stable IDs, the graph, `--json`, coded diagnostics, llms.txt, skills, and an
  Inspector API with actions.
- The CLI has no MCP server. The app's own `/mcp` endpoint exposes only app tools, and tools that need
  approval return an error ([mcp.ts](../../packages/runtime-hono/src/mcp.ts)).
- Encore, Motia and NestJS don't offer this, and it delivers on the landing page's "for agents and
  engineers".

**Done when.** An agent can fix a failing route end to end (find it, read its trace, edit, verify)
using only `relkit mcp`, and the MCP Inspector can connect to it.

#### 19. Provider SDK with a conformance kit

**Status** Agreed · **Priority** P2 · **Effort** M

**Decision.** Publish a provider-author guide, a starter package, and the conformance suites that
already exist (`runJobsConformance`, and the bucket, cache and realtime fakes with failure injection)
as a public kit. Runtime and deploy adapters (#10, #12) and agent adapters (#22) use the same
approach.

**Why.** The brief's open question about which plugin boundaries outside contributors need is still
unanswered, and every integration today was written by the maintainer. This is how integrations grow
without the maintainer.

**Depends on.** #5 and #6, for a stable provider contract.

**Done when.** A community-written provider passes the conformance suite.

#### 20. Stability policy and 1.0 criteria

**Status** Agreed · **Priority** P2 · **Effort** S

**Decision.** Publish what 1.0 means, and set a target date:

- Core APIs follow semver.
- Deprecated APIs keep working for one minor release.
- Every breaking change ships an automated migration (`relkit migrate` already exists for the folder
  layout) and a migration note.

**Why.** The current policy of clean breaking changes with no compatibility layers (AGENTS.md,
ADR-009) is right for a prototype and drives adopters away. Teams need to know when it is safe to
build on RelKit. The migration in section E is the last big break before this policy applies.

**Done when.** A versioning and upgrades page exists with a 1.0 target date.

#### 21. Community launch after the P0 items

**Status** Agreed · **Priority** P2 · **Effort** S

**Decision.**

- Turn on GitHub Discussions (currently off) or start a Discord.
- Publish the Core/Labs roadmap.
- Label about ten good first issues.
- Set the repository description.
- Launch (Show HN, r/typescript, the Bun and Effect communities) after the P0 items, once a newcomer
  can go from zero to an app deployed on Railway in 15 minutes.

**Why.** There is only one first impression. Launching while `create` refuses current Bun would waste
it.

**Done when.** Ten issues or PRs from outside contributors, and three projects in a showcase.

### G. Deferred items

#### 17. Escape hatches and eject (deferred)

**Status** Deferred. Wanted before deciding: more API examples, and a guarantee that eject works
completely.

The next proposal should include:

- **Mount a Hono app inside RelKit**, for existing routes you don't want to move.
- **Mount RelKit inside an existing Hono app**, to adopt one function and one job at a time.
- **Eject:** what `relkit eject` would generate (plain Hono, Drizzle and job-runner code) and what it
  can't.
- **A proof that eject works:** every template, after ejecting, passes the same HTTP and job test
  suite it passed before, in CI.

**Why it matters.** Frameworks that compile your app live or die on fear of lock-in. The brief's
managed, hybrid and detached modes never shipped, and the consolidation plan still lists the Hono
escape hatch as "retain or defer". Raw routes (`defineRoute({ handler })`) are a start.

## 5. Roadmap

| Phase                   | Weeks         | Items                                                                                                                       | Exit criteria                                                                                                                                                                                                                                                          |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Open the front door  | 1–2           | #1, #2, #3, #4, #5                                                                                                          | `create` works on the latest Bun for every template; one positioning everywhere; any Standard Schema validator works; Core/Labs published                                                                                                                              |
| 2. One breaking release | 3–8           | #6; #13 (a, b, c, the route-level part of d, and g); #14; #15; #16's new call style; plus #7, #8 and the benchmarks from #9 | One beta, then one release, with one codemod and one migration guide: `relkit` and `@relkit/*` on one version; one error format; the plain Better Auth file with route-level auth; `createRelkit`; examples and templates migrated; repo hygiene done; benchmarks live |
| 3. Production           | 9–14          | #10 (Node), #12 (Docker, Postgres backend, Railway), #13 (e, f and function `access` rules), #11, #18, the rest of #9       | A newcomer deploys to Railway in 15 minutes; the server runs on Node; function `access` rules and typed middleware; TypeScript 7 in CI; `relkit mcp` works with the MCP Inspector; incremental reload                                                                  |
| Launch                  | After phase 3 | #21                                                                                                                         | The newcomer test passes                                                                                                                                                                                                                                               |
| Next quarter            | —             | #12 (Vercel, then Cloudflare), #10 (Workers, then others), #16's switch to REST, #22, #19, #20                              | Each item's "done when"                                                                                                                                                                                                                                                |

Phase 2 is longer than first planned (six weeks instead of four) because it now carries every
breaking change at once. Additive changes can move between phases freely.

#8 runs alongside phase 2, because the breaking release changes the same dependencies. The deferred
#17 comes back for a decision in the next review.

## 6. Metrics to track

| Metric                                                | Today                                                     | Target                          |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| `create` success on the latest Bun, all templates     | 0% (refused)                                              | 100%, checked nightly           |
| Time from `create` to a first route, for a newcomer   | Not measured                                              | Under 5 minutes                 |
| Time from `create` to an app deployed on Railway      | Not possible                                              | Under 15 minutes                |
| Runtimes passing the HTTP test suite                  | Bun                                                       | Bun and Node, then Workers      |
| Save-to-serving p95 for a 100-function app            | Not measured                                              | Under 1 second                  |
| `relkit check` peak memory compared with `tsc`        | About 2× on small apps                                    | At or below 1×                  |
| Agent eval pass rate (check and tests, first attempt) | 1 of 3 graph checks completed; 2 stopped by memory limits | Published every release         |
| Issues and PRs from outside contributors per month    | 0                                                         | 10 or more after launch         |
| Publishable packages                                  | 56                                                        | 6 first-party plus integrations |

## 7. What to stop doing

> **Adopted in round 4.** These rules stand until Core reaches 1.0, when they get reviewed again.

| Stop                                                                            | Instead                                                                                                                       | Why                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Adding new feature areas: descriptor kinds, provider families, integrations     | Finish this plan first                                                                                                        | Each new area multiplies testing across runtimes and hosts; 1.0 needs depth                                |
| Refusing to create projects on untested setups                                  | Test nightly in CI, warn users, and offer `--strict` for people who want refusal                                              | Today the first command fails on the current Bun                                                           |
| Committing raw evidence and bug-report files                                    | Attach them to CI runs and releases, and keep short summaries                                                                 | 196 MB of evidence, 1,661 report files and personal paths in a public repo                                 |
| Special fast paths for example apps, such as `snapshot-commerce-eligibility.ts` | Make the normal reload path fast (#9)                                                                                         | Example-specific code doesn't help real apps and costs maintenance                                         |
| Leading with AWS/Pulumi                                                         | Lead with Railway, then Vercel and Cloudflare; keep AWS in Labs until it builds images, serves HTTPS and passes a real deploy | Matches the agreed priority; AWS hosting today is HTTP-only, runs a single task and is untested end to end |

## 8. Background: the review

### 8.1 Scope and method

**Reviewed**

- The 56 publishable packages (42 under `packages/`, the integration catalog and 13 integrations),
  the docs site and the Inspector app, at varying depth.
- Templates, examples, CI workflows, release tooling, ADRs, OpenSpec specs and plans.
- The repository's own evidence: dev-startup benchmarks, install measurements and agent evals.
- Public data: npm downloads and versions, GitHub repository stats and recent CI runs.

**How**

- Direct reading of source and docs.
- Structured code inventories of three areas: the authoring API; the runtime and deployment; the
  CLI, Inspector and docs.
- Hand re-checks of the most consequential claims. Two behaviours were reproduced by running code,
  and Better Auth's behaviour without a database was checked in its installed source.

**Not done**

- No full test-suite run and no cloud deployment.
- No end-to-end `create` on Bun 1.4.4. The refusal was reproduced by calling the shipped capability
  check with a newer Bun identity.
- Performance figures come from the repository's own evidence files, not new measurements.
- Comparisons with other frameworks are positioning notes, not benchmarks.

### 8.2 Where RelKit stands

| Dimension        | Today                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Age              | First commit 2026-08-10 (under three months)                                                                         |
| Team             | One maintainer working with coding agents; every commit, issue and PR comes from the maintainer or a bot             |
| Framework source | ~277k lines in ~3,300 source files across 56 publishable packages                                                    |
| Apps and tooling | Inspector UI ~44k lines, docs site ~15k lines, repository scripts ~26k lines                                         |
| Tests            | 1,415 test files; CI runs take 11–19 minutes; 70 of the last 100 CI runs passed (18 failed, 12 cancelled)            |
| Docs             | ~187 pages: 15 learn, 120 modules, 41 API reference, 8 guides, 3 blog posts                                          |
| Adoption         | 1 GitHub star, 0 forks, Discussions off, empty repository description; ~3.1k npm downloads a month for `@relkit/app` |
| Toolchain pins   | Bun 1.3.10 (latest 1.4.4), TypeScript 5.9.3 (latest 7.0.2), Effect 4.0.1 (latest 4.1.2)                              |

Where the effort has gone (non-test `.ts`/`.tsx` lines, approximate):

| Area                                                                                    | Lines |
| --------------------------------------------------------------------------------------- | ----: |
| Toolchain: CLI, creator, compiler, graph                                                |  ~80k |
| Inspector and observability: Inspector UI app, inspector, inspector-api, observability  |  ~72k |
| Authoring APIs: app, functions, routes, events, services, schema, config, jobs, agents… |  ~48k |
| Runtime: runtime-hono, engine, invocation, runtime-effect, supervisor                   |  ~43k |
| Local providers: providers-local, provider, local-service, local, docker                |  ~23k |
| Client and testing: client, client-generator, testing                                   |  ~22k |
| LangChain integration                                                                   |  ~13k |
| Other integrations: redis, s3, cloudflare, otlp, sentry, inngest, trigger, effect-mq    |   ~9k |
| Deployment: deploy, deploy-pulumi, cloud-aws, aws, pulumi                               |   ~7k |
| Data and auth: drizzle, better-auth                                                     |   ~4k |

The dev-time Inspector and the toolchain hold the most code. Deployment, the step every production
user needs, holds the least and is the least proven.

### 8.3 Strengths to keep

- **The application graph is the moat.** Stable IDs, typed edges, `RELKIT_*` diagnostic codes with
  documentation paths, and hash-checked artifacts. Few TypeScript frameworks have a real model of the
  whole application.
- **Function-only execution (ADR-001).** Routes, jobs, events, tools and agents all target functions,
  so validation, cancellation, retries and telemetry live in one engine.
- **The Inspector.** 44 pages, including a graph explorer, a trace waterfall, function invoke, a route
  composer and agent chat, behind a token-checked local bridge.
- **Last-known-good development.** A broken save never takes down the running app.
- **Transactional scaffolding.** `relkit add` snapshots the project, writes, installs, runs `check` and
  rolls back on failure.
- **Release and supply-chain discipline.** Exact pins, SHA-pinned GitHub Actions, npm trusted
  publishing, smoke tests on the packed tarballs, and 96% coverage plus mutation testing on jobs.
- **Docs generated from source.** CLI reference from the same model the CLI uses, API reference from
  TSDoc, executed `@example` blocks, drift checks, llms.txt and a markdown copy of every page.
- **Agent groundwork.** A global `--json` flag, `diagnostics.json`, shipped skills and real agent
  evals.
- **Candor about limits.** The deployment docs state plainly what is and isn't supported.

### 8.4 Diagnosis

RelKit's engineering is well ahead of its reach.

- **The front door is locked.** Creation works only on Bun 1.3.10 and only for the `minimal`
  template.
- **The scope is a large team's roadmap.** 56 publishable packages for one maintainer, and every
  feature multiplies the test matrix.
- **The effort is inverted.** The dev-time Inspector is the most polished part; production deployment
  and durable events are the least finished.
- **The language is internal.** Vocabulary from specs and release certification reaches the README,
  error messages and changelog.
- **Promises and code have drifted.** ADR-002 promises no Effect in public APIs, yet `@relkit/app`
  exports 206 `*Effect` functions. `z` looks like Zod but isn't. The brief's roles, policies and
  detach modes never shipped.

### 8.5 Additional findings by area

These didn't become standalone decisions, but they feed the work above.

**Onboarding and CLI**

- 16 top-level commands share a global `--json` flag and stable exit codes. `dev`, `start` and
  `inspector` emit no JSON result.
- `relkit add` supports 19 kinds and applies changes as a transaction. Keep this pattern.
- The CLI is ~46k lines in 576 files. The dev subsystems (~13k lines) and scaffolding (~9k lines)
  dominate. The 250-line file cap produces many small files, including 101 `*.types.ts` files in the
  CLI alone.
- The template `start` scripts run the built server directly instead of `relkit start`.

**Authoring API and testing**

- The `@relkit/app` root exposes 598 runtime exports.
- `@relkit/app/internal/runtime` and `@relkit/testing/internal/*` are published, and testing's public
  types import `@relkit/runtime-effect`.
- `createTestApplication(...).http` returns raw `Response` objects.
- Strong points to keep: `invokeFunction` fakes declared dependencies automatically, `TestClock`
  controls time, provider fakes support failure injection, and there are job and event test helpers.

**Compiler and runtime**

- Discovery parses files first, then imports candidates in a short-lived Bun child process with
  patched globals. `relkit.config.ts` is imported in the CLI process itself, so user top-level code
  runs during `check`. That's normal for config-as-code tools, but the docs should say so plainly and
  not overstate "isolation".
- Diagnostics are well designed: stable `RELKIT_*` codes (68 in the compiler's normalizer, ~460
  across the repository), file, line and column, a suggestion and a documentation path, with JSON and
  CI-annotation reporters.
- The graph format is version 10, with 17 node kinds and 23 edge kinds.

**Jobs, events and realtime**

- Durable events are delivered at least once. Ephemeral events have a capacity of 100 and drop the
  newest on overflow.
- After a crash, local recovery re-queues running jobs, so handlers must be idempotent. Document this
  prominently.
- Trigger.dev's local service "did not become healthy". Managed-cloud runs are untested for Inngest
  and Trigger.dev, and unsupported for Effect MQ.
- Realtime runs on Redis or a local JSON file.

**Deployment**

- The AWS host creates a new VPC with public subnets, ECR, CloudWatch logs, IAM roles, an ECS cluster
  and a load balancer. Owned resources are limited to S3 and ElastiCache Redis/Valkey.
- `relkit:jobs:*` resource types have no Pulumi provider in the repository.
- Deployment tests use mocks.

**Observability**

- RelKit has its own record format with W3C trace propagation, redaction before every sink and
  trace-consistent sampling. These are good foundations.
- No OpenTelemetry SDK is used. The OTLP exporter is hand-written HTTP/JSON and exports traces and
  logs only, not metrics. Sentry receives `captureException` for error records.
- Consider OpenTelemetry semantic conventions and metrics export, so RelKit apps plug into existing
  dashboards unchanged.

**AI, agents and MCP**

- Agent execution runs only on LangChain, LangGraph and deepagents; the AI SDK path was removed. No
  integration supplies the `model` capability the engine requires for non-native agents.
- The runtime MCP server builds a new `McpServer` per request and exposes tools only, with no
  resources or prompts.

**Inspector**

- 44 pages over a token- and Origin-checked bridge on `127.0.0.1`, with history in DuckDB. Production
  builds exclude it. These are strong security defaults.
- Available actions: function invoke, route composer (including streams), job retry and cancel,
  schedule pause, resume and delete, tool approve and deny, and agent chat.
- Missing actions: event publish and replay, job trigger, and UI for event retry and cancel.

**Documentation**

- ~187 pages, with generated CLI and API reference, executed examples and drift checks.
- Missing topics: FAQ, comparison, migration from Hono or Express, performance, self-hosting outside
  AWS, versioning and upgrade policy, and guides for jobs, realtime, deployment and testing.
- The generated API reference is very large (the jobs page alone is ~20.8k lines). Curate the
  most-used APIs.
- The template skill has no deployment reference.

**Repository, CI and process**

- CI runs take 11–19 minutes, and 70 of the last 100 runs passed.
- `.agents/skills` mixes RelKit skills with 28 vendored ones. Keep only what applies here.
- Local housekeeping only: this clone carries ~778 MB of leftover temporary pack files (`git gc`
  reclaims them) and an untracked `integrations/packages/ai-sdk` directory. The GitHub repository
  itself is 47.6 MB.

## Appendix A. Data sources

- **npm downloads**, 2026-09-30 to 2026-10-29: `@relkit/app` 3,136; `create-relkit` 3,160; `relkit`
  1,877; `@relkit/cli` 2,843; `@relkit/inspector` 645.
- **Latest versions on npm** (2026-11-02): Bun 1.4.4; TypeScript 7.0.2; Effect 4.1.2; Hono 4.13.16;
  Better Auth 1.7.15; Zod 4.6.7; drizzle-orm 0.45.4; `@orpc/contract` 1.16.1.
- **GitHub** (2026-11-02): 1 star, 0 forks, 0 watchers, 2 open issues, Discussions disabled, empty
  description, created 2026-08-27, repository size 47.6 MB.
- **CI:** the last 100 runs of `checks.yml`: 70 succeeded, 18 failed, 12 were cancelled.
- **Repository evidence:**
  - `docs/evidence/create-capabilities/0.8.7/fresh.json` and `restart.json` (dev startup);
  - `docs/evidence/lean-install/stage-1.md` (install measurements);
  - `tests/agent-evals/results/2026-10-20-domain-services.md` (agent evals).
- **Better Auth 1.7.1 source** (installed copy): without a `database`, it uses an in-memory adapter
  (`dist/db/adapter-base.mjs`), and every instance exposes `handler`, `api`, `options` and `$context`
  (`dist/auth/base.mjs`).

## Appendix B. Reproducing the verified checks

Both checks were run with Bun 1.3.10 at commit `0e6f85e3f`. Run each script from a file at the
repository root, or adjust the import paths to your checkout.

### B.1 Creation refuses any Bun other than 1.3.10

```ts
import {
  assertCreateCapability,
  currentCreateCapabilityIdentity,
  supported,
} from "./packages/create-relkit/src/create-capabilities.ts";

const identity = currentCreateCapabilityIdentity();
const options = {
  template: "minimal",
  cloud: "none",
  deploy: "none",
  jobs: undefined,
  examples: true,
} as const;

console.log(supported(options as never, identity)); // true on Bun 1.3.10
console.log(supported(options as never, { ...identity, bun: "1.3.11" })); // false
for (const template of ["api", "agent", "fullstack", "tasks"]) {
  console.log(template, supported({ ...options, template } as never, identity)); // false for each
}
assertCreateCapability(options as never, { ...identity, bun: "1.3.11" });
// Throws: "Creation combination is not certified: template=minimal/jobs=none/cloud=none/
// deploy=none/examples=on. Supported: none for this tool identity."
```

### B.2 Zod 4 schemas get no projection in the compiler's legacy direction

Zod is not a root dependency; install Zod 4 in a scratch folder or point the import at any Zod 4
installation.

```ts
import { z as zod } from "zod"; // Zod 4.6.x
import { z } from "./packages/schema/src/index.ts";
import { getSchemaProjection } from "./packages/schema/src/json-schema-inspection.ts";

const zodSchema = zod.object({ name: zod.string() });
const relkitSchema = z.object({ name: z.string() });

for (const direction of ["legacy", "input", "output"] as const) {
  console.log(
    direction,
    typeof getSchemaProjection(zodSchema as never, direction),
    typeof getSchemaProjection(relkitSchema as never, direction),
  );
}
// legacy  undefined  function
// input   function   function
// output  function   function
```

## Appendix C. Review history

### Round 1 (2026-11-02)

- **Agreed:** #1 and #10, widened to all stable runtimes; #2; #4, covering Zod, ArkType, Effect
  Schema and Valibot; #11, including RelKit's own codebase; #12, with Dockerfile generation,
  Pulumi-supported targets, and Railway, Cloudflare and Vercel as the main targets; #15, plus access
  outside handlers; #18, plus MCP Inspector support; #19; #20; #21; the additional findings; the
  metrics.
- **Deferred:** #17, pending more API examples and a guarantee that eject works completely.
- **Asked for clarification:** #3, #5, #6, #7, the "Reach every TypeScript developer" section (mainly
  #9), #13, the "Make the API coherent" section (#14 and #15), #16 and "What to stop doing".
- **Open questions answered:** see the decision log.
- **Asked for a recommendation:** LangChain directly or through adapters. Recommended adapters.
- **Correction:** #6's package target was restated (framework packages, not all publishable
  packages).

### Round 2 (2026-11-02)

- **Agreed after clarification:** #3; #5; #6, with the maintainer's `relkit` and `@relkit/*` split;
  #7; #9; #13, with the maintainer's plain Better Auth file; #14 and #15; #16.
- **Decided:** Railway is the first deploy target; agents run through adapters (#22).
- **Questions answered in this document:**
  - The `relkit` and `@relkit/*` split: agreed, with first-party optional tools also under
    `@relkit/*` (#6).
  - The plain Better Auth file: agreed, with how RelKit handles the database, mounting, types and
    secrets (#13 g).
  - "Is making the API coherent internal?" No: most of it changes what users write, so it ships with
    the rename as one migration (section E).
- **Not stated:** "What to stop doing" (the reject list was empty) and #8.

### Round 3 (2026-11-02)

- **Decided:** the `relkit` rename and every change that breaks existing code ship as one release,
  with one codemod and one migration guide, published as a beta first.
- **What that moved:** #16's new call style and the route-level part of #13 (d) joined that release
  (roadmap phase 2, now weeks 3–8). Additive changes, including the client's switch to REST under
  the hood, stay free to ship before or after it.
- **Still open:** "What to stop doing" and #8.

### Round 4 (2026-11-02)

- **Adopted:** "What to stop doing" (section 7), as proposed. Its rules stand until Core reaches 1.0.
- **Still open:** #8, the pre-release dependency policy.

### Round 5 (2026-11-02)

- **Adopted:** #8, the pre-release dependency policy, as proposed. It moved into section B and runs
  alongside the breaking release in roadmap phase 2.
- **Nothing else is open.** #17, escape hatches and eject, stays deferred until there are more API
  examples and a way to prove that eject works.
