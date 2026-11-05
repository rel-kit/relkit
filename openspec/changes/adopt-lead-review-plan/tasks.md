# Tasks

Groups follow the plan's roadmap: groups 1–5 are phase 1, groups 6–13 phase 2 (the breaking release),
groups 14–19 phase 3, group 20 the launch, and groups 21–26 the next quarter. Plan decision numbers
appear in group titles.

Every task is verified on its pull request, before it merges: by local runs or by CI runs on that
pull request, against packages packed from it. No task's verification may depend on merging to
`main`, publishing a release, or running a workflow from `main`. Steps that can only happen after a
merge, such as publishing to npm or announcing, are listed under "Release steps after merge" and are
not tasks of this change.

## 1. Creation works on current Bun (#1)

- [x] 1.1 Change `create-capabilities.ts` to match release and template identity plus the runtime's major and minor version instead of exact identities, and verify with unit tests that a Bun 1.3.11 identity matches 1.3.10 evidence while 1.4.4 is reported as untested
- [x] 1.2 Emit a `RELKIT_CREATE_UNTESTED` warning with a docs link instead of refusing untested combinations, update `create-capabilities.test.ts` to expect the warning for Bun 1.3.11, and verify the creator test suite passes
- [x] 1.3 Add `--strict` to `create-relkit` and `relkit create` so untested combinations are refused before any file is written, and verify with a test that the destination stays empty after a strict refusal
- [x] 1.4 Offer the `minimal`, `api`, `agent`, `fullstack` and `tasks` templates in interactive and flag-based creation, marking untested combinations, and verify by creating each template in the packed-consumer test
- [x] 1.5 Make `--help`, the README and the templates README list the same five templates, and verify with a docs test that compares the three lists
- [x] 1.6 Make CI release readiness measure every template on each Tier 1 runtime and write the capability table as a CI output, and verify the release-readiness workflow uploads the table
- [x] 1.7 Add a creation canary workflow that runs nightly with the published `create-relkit@latest` on the latest Bun and opens or updates an issue on failure, and also runs on pull requests that change creation, templates or the workflow itself using the creator packed from the pull request; for each template it creates the project, runs its test command and runs its dev command until the app responds; verify with the pull request's canary run passing for every template
- [x] 1.8 Document the untested warning and `--strict` in the create guide and on the `RELKIT_CREATE_UNTESTED` page, and verify the docs build passes
- [x] 1.9 Make the `tasks` template prepare and start when created with installation (it fails with `RELKIT_CREATE_PREPARE_FAILED: Development snapshot ineligible during compilation.aliases`), and verify with a regression test and with release readiness reporting `tasks` as tested on the pull request

## 2. Positioning and Why RelKit (#2)

- [x] 2.1 Put the positioning sentence in the README opening, the landing hero and the docs index, and verify the positioning check from 2.4 passes
- [x] 2.2 Set the npm descriptions of `relkit` and `create-relkit` and the GitHub repository description to the positioning sentence, and verify with the positioning check
- [x] 2.3 Write the Why RelKit page comparing RelKit with Encore.ts, Motia, NestJS and Hono with tRPC or oRPC, stating where each side is stronger, and verify it renders and appears in the docs navigation
- [x] 2.4 Add a release check that fails when the README, landing page, those npm descriptions or the GitHub description differ from the positioning sentence, and verify it fails on a mismatched fixture
- [x] 2.5 Write an FAQ and a "Migrate from Express or Hono" guide with runnable snippets, and verify the snippets compile in the docs test suite

## 3. Plain language (#3)

- [x] 3.1 Write the writing standard (product name, message structure, banned terms, changelog format) and link it from CONTRIBUTING, and verify the link resolves in the docs link check
- [x] 3.2 Add a spelling check for "RELKIT" and "Relkit" outside code in docs, README and CLI strings, replace the existing occurrences with "RelKit", and verify the check passes
- [x] 3.3 Add a banned-term check for user-facing text (tuple, certified, readiness evidence, receipt, capsule, cohort, admission), remove agent-only instructions from the README, and verify the check passes on the repository and fails on a fixture
- [x] 3.4 Give every user-facing CLI and runtime error a `RELKIT_*` code, the next step and a docs link, and verify with snapshot tests for creation, check, dev and deploy errors
- [x] 3.5 Generate one docs page per `RELKIT_*` code from diagnostic metadata and make docs generation fail when a code has no page, and verify by adding an undocumented code in a test
- [x] 3.6 Convert the changelog to one line per change under Breaking, New and Fixed with migration links, and verify the release-notes generator output in its tests
- [x] 3.7 Fix stale facts in the README (the docs tool), the templates README and the `documentation-writer` skill, and verify the template-list check from 1.5 and a docs review pass

## 4. Standard Schema validators (#4)

- [x] 4.1 Add projection fallbacks: `~standard.jsonSchema` in the input and output directions, then lazily loaded converters for Effect Schema, Valibot and ArkType as optional peers, and verify with unit tests per library
- [x] 4.2 Canonicalize projected JSON and add schema library versions to the build fingerprint, and verify the projection is identical across two runs and the fingerprint changes when the Zod version changes
- [x] 4.3 Add a test app whose function, event, task and error contracts use Zod 4, ArkType, Effect Schema and Valibot, and verify `relkit check` passes and OpenAPI contains every schema
- [x] 4.4 Keep `RELKIT_SCHEMA_UNAVAILABLE` for schemas without a projection path and document the supported libraries on its page, and verify with a fixture schema that has none
- [x] 4.5 Switch templates, examples and docs to Zod 4 with `zod` as a template dependency, and verify the template creation tests and docs examples pass
- [x] 4.6 Prepare the rename of the built-in builder from `z` to `s` for the breaking release (export and codemod rule land in groups 7 and 12), and verify type tests for `s` on the pull request

## 5. Core and Labs (#5)

- [x] 5.1 Add `relkit.maturity` (`core` or `labs`) to every package manifest, and verify a manifest check lists every package with a tier
- [x] 5.2 Tag every Labs export with `@experimental` TSDoc, and verify with the maturity check from 5.4
- [x] 5.3 Add `labs: true` docs frontmatter that renders a Labs badge on the page and in the sidebar, and verify in a browser check that the realtime guide shows both
- [x] 5.4 Add a maturity check comparing manifest tiers, TSDoc tags and docs flags, and verify it fails on a fixture with a missing tag
- [x] 5.5 Publish the maturity table with the initial assignment (Core including built-in telemetry; Labs including realtime, AWS hosting, job adapters, agent adapters and graph workflows), and verify the page renders
- [x] 5.6 Record the feature freeze in CONTRIBUTING and the pull request template, and verify the template asks whether a new feature area has an approved OpenSpec change

## 6. Governance, repository hygiene, dependency policy and stop-doing rules (#7, #8)

- [x] 6.1 Write the OpenSpec scope rule into CONTRIBUTING and the pull request template, and verify the template asks whether the change needs a spec
- [x] 6.2 Make evidence-producing scripts upload full reports as CI artifacts and release assets, delete raw JSON under `docs/evidence` while keeping per-release summaries, and add a check that keeps `docs/` under 5 MB; verify the check passes, the pull request's CI run uploads the artifacts, and the release-readiness packaging rehearsal attaches them to the rehearsed release
- [x] 6.3 Remove the committed `bug-fix-reports/` and `bug-fix-ui-reports/` artifacts, link their GitHub issues instead, and add a check that rejects new report artifacts; verify the check fails on a fixture
- [x] 6.4 Remove machine-specific absolute paths from committed files and add a path check with a documented allowlist, and verify the check passes on the repository
- [x] 6.5 Vendor the `use-effect` skill into `.agents/skills` and point AGENTS.md at it, and verify no guidance references a personal path
- [x] 6.6 Remove vendored skills that do not apply to this repository and add a skills check, and verify the check passes
- [x] 6.7 Turn each mandatory rule in AGENTS.md and CONTRIBUTING into a `prepush` or CI check or label it advisory, and verify with a CONTRIBUTING table that maps every mandatory rule to its check
- [x] 6.8 Start CONTRIBUTING with a quickstart of at most ten lines and move release certification to a maintainer document, and verify the quickstart in a clean-checkout CI job
- [x] 6.9 Write `docs/dependencies.md` listing the oRPC 2.0 beta, the patched drizzle-orm release candidate and the patched blume and `@effect/docgen` with owners and exit plans, and add a policy check against the lockfile; verify it fails when an unlisted pre-release is added
- [x] 6.10 Update lagging pins (Effect, Hono, Better Auth) where the test suite passes and record any that cannot move in the policy, and verify with the full test suite
- [x] 6.11 Record the stop-doing rules in CONTRIBUTING and the review checklist, and verify the checklist appears in the pull request template

## 7. Packages and one version (#6)

- [x] 7.1 Create the `relkit` package from the authoring and runtime packages listed in design D1, with root and focused subpath exports, and verify packed export maps and a consumer import test
- [x] 7.2 Move the `relkit` command into the `relkit` package as a launcher for the project's `@relkit/cli`, with a coded error when the CLI is missing, and verify both cases in tests
- [x] 7.3 Merge compiler, client-generator and supervisor into `@relkit/cli`, observability-local into `@relkit/inspector`, inspector-api into `relkit` and deploy-pulumi into `@relkit/pulumi` (graph and the deploy contract go to `relkit`; see design D1), and verify each package builds and its tests pass
- [x] 7.4 Remove `providers-standard`, fold `cloud-aws` into `@relkit/aws` and the integration catalog metadata into `create-relkit`, and verify the creator and `relkit add` read the bundled metadata
- [x] 7.5 Replace package-boundary enforcement with source-folder boundary and konsistent rules inside merged packages, and verify `bun run check` and `konsistent validate` fail on a cross-boundary import fixture
- [x] 7.6 Remove `internal/*` subpath exports and internal type references from published packages, and verify with an export-map and declaration scan
- [x] 7.7 Configure one Changesets `fixed` group for `relkit`, `create-relkit` and `@relkit/*` and make the Git tag equal the release version, and verify a dry-run version bump gives every package the same version
- [x] 7.8 Export the renamed builder `s` from `relkit/schema` and update `engines`, descriptions and READMEs for the new packages, and verify the manifest check
- [x] 7.9 Verify with the packed-consumer footprint test that a production install of `relkit` plus one integration contains no compiler, TypeScript, testing, Inspector UI or client package

## 8. Errors and the Better Auth file (#13 a, b, c, route part of d, g)

- [x] 8.1 Return RFC 9457 Problem Details for declared, validation, rate-limit, timeout, cancellation, authentication, access, unmatched-route (404 and 405) and defect responses, with `traceId` and `Retry-After`, and verify HTTP tests for each case
- [x] 8.2 Generate OpenAPI problem schemas for each declared error and for validation, and verify the OpenAPI snapshot tests
- [x] 8.3 Let handler types accept thrown declared errors, drop the rule that every declared error must be raised, and add it as an opt-in lint rule, and verify type tests for thrown, returned and unused errors
- [x] 8.4 Add route response options for status, headers and cookies computed from the function's output, and verify HTTP tests plus a test that the same function still runs from a job
- [x] 8.5 Add route-level `auth: "required"` checked before middleware and the target, remove protected-path lists, and share one memoized session across middleware and context, and verify tests for signed-out, signed-in and auth-endpoint requests
- [x] 8.6 Accept a Better Auth instance in `defineBetterAuthService({ auth })`: rebuild it from `auth.options` with the default Drizzle database when none is set, mount it at `basePath` unless `mount: false`, and type the session from the instance; verify integration tests for both database modes
- [x] 8.7 Verify with the evaluator's detectors that importing a Better Auth file during `check` opens no timers or sockets
- [x] 8.8 Declare `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in the auth templates' `defineEnv` and fail startup with a coded error when they are missing, and verify the startup test
- [x] 8.9 Update the auth templates, `examples/auth-drizzle`, the commerce example and the auth docs to the plain Better Auth file and route-level auth, and verify their tests and docs examples pass

## 9. Effect boundary (#14)

- [x] 9.1 Limit the `relkit` root to Promise APIs and move the Effect helpers to `relkit/effect`, and verify with an export-list snapshot
- [x] 9.2 Tighten the declaration scanner again so the root entry and generated application declarations expose no Effect types, and verify it fails on a leaking fixture
- [x] 9.3 Move the Effect usage in generated `runtime-integrations.ts` into the runtime so applications need no direct `effect` dependency, and verify a generated app builds and runs without `effect` in its manifest
- [x] 9.4 Keep Effect-returning handlers on the same cancellation, tracing and error mapping as Promise handlers, and verify engine tests that run both side by side
- [x] 9.5 Document returning Effects and the `relkit/effect` entry point, and verify the doc examples compile

## 10. One way to do each thing and the runtime handle (#15)

- [x] 10.1 Extend `dependencies` with `functions`, `events`, `channels` and `databases`, expose them on `ctx`, and build graph call edges from the declarations, and verify type tests and graph snapshot tests
- [x] 10.2 Remove `publishes`, descriptor `.invoke()` and channel `.trigger()` from the public API, and verify type tests reject the old forms
- [x] 10.3 Implement `getRelkit()` from asynchronous invocation context with a coded error when no application is running, and verify tests in raw routes, middleware, startup hooks and a bare script
- [x] 10.4 Implement `createRelkit(config)` and `close()` so only the graph's required providers activate, and verify a seed-script test leaves no listener or worker running
- [x] 10.5 Record runtime-handle calls with source `system` in traces and the Inspector, and verify a trace test
- [x] 10.6 Verify with a concurrency test that two handles in one process each use only their own application
- [x] 10.7 Require explicit IDs for errors with a source-located diagnostic when one is missing, and verify compiler tests
- [x] 10.8 Remove the duplicates and aliases — the legacy `defineJob` and `jobs/legacy` entry and runtime paths, the second `defineAgent`, the `job` key, `getJsonSchema`/`toJsonSchema`, builder `void`/`undefined`, `defineTransform`/`defineRequestTransform` and the job `profile` alias — and verify type tests and that the legacy job runtime code is deleted
- [x] 10.9 Let route modules export a `defineServiceRoutes` map without destructuring and remove the editor plugin's destructuring quick fix, and verify compiler and editor tests
- [x] 10.10 Rewrite the concept docs to show one pattern per concept, and verify the docs examples compile

## 11. Client call style (#16, first part)

- [x] 11.1 Generate an `api` object that mirrors services and routes, and verify generated-client snapshot tests
- [x] 11.2 Make hooks take `api` properties instead of string keys and put `code`, `status` and `data` in the error union, and verify type tests that narrow on `code`
- [x] 11.3 Remove the runtime `effect` dependency from the browser client, and verify a bundle analysis shows no Effect runtime
- [x] 11.4 Publish backend contract changes to frontends during development so they update without a restart, and verify with a browser test on `examples/commerce-web`
- [x] 11.5 Update `examples/commerce-web`, the fullstack template and the client docs to the new call style, and verify their tests and docs examples

## 12. Migration, beta and release

- [x] 12.1 Build `relkit migrate` codemods for imports and package names, `.invoke()` and `.trigger()`, dependency declarations, explicit error IDs (writing the previously inferred ID), removed aliases and legacy jobs, `defineServiceRoutes`, Better Auth options to a Better Auth file, the `z` to `s` builder rename, client hook call sites and agent `runtime` fields, and verify each rule with fixture tests
- [x] 12.2 Give `relkit migrate` preview, write and rollback receipts like `migrate layout`, listing code it cannot change with file and line, and verify with tests
- [x] 12.3 Migrate every repository example and template with `relkit migrate` only, and verify their check, typecheck, test and build commands pass
- [x] 12.4 Write the 0.9 migration guide and changelog in the new format, and verify the guide's snippets compile
- [x] 12.5 Rehearse `0.9.0-beta` on the release-branch pull request: version and pack the candidate, run the packed-consumer, creation and runtime suites against the packed packages from a local registry, and verify all pass
- [x] 12.6 Prepare the final `@relkit/app` that re-exports `relkit` and carries its deprecation message in the release configuration, and verify with the packed candidate that a project on the final `@relkit/app` builds and the release rehearsal includes the deprecation step

## 13. Development loop (#9; benchmarks in phase 2, reload in phase 3)

- [x] 13.1 Generate benchmark apps with 10, 100 and 500 functions and a script that measures save-to-serving p95 and `relkit check` peak memory against `tsc`, and verify the script reports both metrics
- [x] 13.2 Run the benchmarks in release readiness and build the benchmarks page with the measuring host from that CI output, and verify the pull request's run produces the numbers and the docs build shows them
- [x] 13.3 Keep one warm evaluator per dev session that re-evaluates only changed modules and their dependents through `invalidateWatchDependencies`, and verify tests that unchanged modules are not re-imported
- [x] 13.4 Swap the handler table atomically when configuration, providers and route shape are unchanged and fall back to blue/green otherwise, and verify the process stays the same on a handler edit and restarts on a binding change
- [x] 13.5 Run type-checking as a parallel watch process that streams diagnostics to the CLI and Inspector without blocking reloads, and verify a type error does not block a reload
- [x] 13.6 Stop running the production bundler in dev, and verify no bundle is written on save
- [x] 13.7 Keep last-known-good serving for evaluation and graph errors, and verify the syntax-error test
- [x] 13.8 Make `relkit dev --prepare` a finite check without snapshots and update the `--no-install` next steps, and verify the post-install workflow test
- [x] 13.9 Delete the snapshot cache (`packages/cli/src/dev-snapshot`, including `snapshot-commerce-eligibility.ts`) once the budgets hold, and verify the first-start budget test passes without it
- [x] 13.10 Enforce the reload and memory budgets in CI, and verify the job fails on an injected-delay fixture
- [x] 13.11 Document how the dev loop reloads and when it restarts, and verify the docs build

## 14. Node runtime (#10, Tier 1)

- [x] 14.1 Define the runtime adapter interface and move Bun-specific serving, static files, WebSocket upgrade and crypto into the Bun adapter, and verify the existing HTTP tests pass
- [x] 14.2 Implement the Node adapter on Hono's Node server, and verify the `api` template's HTTP suite passes on Node 22 and 24
- [x] 14.3 Add `relkit build --runtime node` producing a Node server and container image, and verify the production build runs on Node
- [x] 14.4 Replace `Bun.RedisClient` with a portable client on Node and choose Sentry and SQLite clients per runtime, and verify the Redis, SQLite and Sentry conformance tests on Bun and Node
- [ ] 14.5 Make `create-relkit` and the CLI run on Node with npm and pnpm, and verify `npx create-relkit` against the packed candidate from a local registry and `npm run dev` in a CI job without Bun
- [x] 14.6 Add a portability check that rejects runtime-specific APIs outside adapters, and verify it fails on a fixture
- [x] 14.7 List Bun and Node ranges in every framework package's `engines`, and verify the manifest check
- [x] 14.8 Add Node to the pull-request runtime matrix and the nightly creation canary, and verify a deliberate Node failure blocks a pull request
- [x] 14.9 Document runtime tiers and running on Node, and verify the docs build

## 15. TypeScript 7 (#11)

- [ ] 15.1 Make generated declarations carry every type guarantee so plain `tsc` reports route and context errors without the editor plugin, and verify the type tests with the plugin removed
- [ ] 15.2 Make `relkit check` run the project's TypeScript compiler as a separate process and map its errors to diagnostics, and verify with TypeScript 5.9 and 7 projects
- [ ] 15.3 Bundle a private `typescript@5.9` parser in `@relkit/cli` for codemods and source scanning, and verify `relkit add` and `relkit migrate` work in a TypeScript 7 project
- [ ] 15.4 Make the editor plugin optional in templates and docs, and verify a template without it type-checks
- [ ] 15.5 Move the workspace's own type-checking and builds to TypeScript 7, keeping the private parser where tools such as the docs generator still need the 5.x API, and verify `bun run typecheck` on TypeScript 7 in CI
- [ ] 15.6 Add TypeScript 5.9 and 7 to the generated-application CI matrix, and verify both jobs run
- [ ] 15.7 Document supported TypeScript versions, and verify the docs build

## 16. Durable Postgres backend (#12)

- [x] 16.1 Evaluate wrapping an existing Postgres queue library against the jobs conformance suite, record the decision in design.md, and verify the chosen approach with a spike test
- [x] 16.2 Implement durable jobs with leasing, retries and dead-letter, and verify the jobs conformance and crash tests
- [x] 16.3 Implement durable events with per-consumer delivery and the transactional outbox through Drizzle, and verify rollback and partial-failure tests
- [x] 16.4 Implement one run per schedule occurrence with a unique occurrence key, and verify a two-instance test
- [x] 16.5 Support workers in the web process and as a separate role, and verify both modes in tests
- [x] 16.6 Add `relkit add jobs --provider postgres` and the events equivalent as transactional edits, and verify the add tests including rollback
- [x] 16.7 Make production builds warn when jobs, events or schedules use the local filesystem provider, and verify the build warning test
- [x] 16.8 Document the Postgres backend, at-least-once delivery and idempotency keys, and verify the docs examples compile

## 17. Production image and Railway (#12)

- [x] 17.1 Make the container image production-ready — non-root, health endpoints, no durable state on disk — for Bun and Node, and verify the container tests
- [x] 17.2 Add `relkit deploy init <target>` with a Railway generator (`railway.json`, container files, CI workflow) that changes no cloud resource, and verify a snapshot test of the generated files
- [x] 17.3 Write the Railway guide with Railway Postgres and add a newcomer deploy test against an authorized Railway test project, and verify HTTPS reachability and job, event and schedule behavior across a restart and with two instances
- [x] 17.4 Document which engine each target uses, and verify the docs build
- [x] 17.5 Mark AWS hosting Labs and list its missing criteria (image build and push, HTTPS, more than one task, real deploy test) on its docs page, and verify the maturity check
- [x] 17.6 Add Railway deployment steps to the template skill's references, and verify the skill content test

## 18. Access rules, typed middleware and several databases (#13 d, e, f)

- [x] 18.1 Implement function `access` rules (roles, permissions, predicate) enforced in the engine for every invocation source, and verify a test for each source: HTTP, job, task, event, tool, agent, MCP and runtime handle
- [x] 18.2 Read roles and permissions from the Better Auth organization plugin, and verify an integration test with organization roles
- [x] 18.3 Run runtime-handle calls as `system` and add `relkit.as(session)`, and verify tests for both principals
- [x] 18.4 Show route authentication and access rules in the graph, OpenAPI security and the Inspector, and verify snapshot tests
- [x] 18.5 Add typed middleware `provides` schemas and an `http.from(middleware, field)` request mapping while keeping Hono middleware, and verify HTTP tests
- [x] 18.6 Add `ctx.databases.<service>` with `ctx.database` as the default, and verify type tests with two Drizzle services
- [x] 18.7 Document access rules, typed middleware and several databases and make the protect-orders tutorial protect a route with one line on the route, and verify the docs tests

## 19. relkit mcp and the Inspector (#18)

- [x] 19.1 Document the Inspector API as a versioned development protocol, and verify the reference lists every endpoint with its version and authentication
- [x] 19.2 Implement `relkit mcp` over stdio using session discovery and the session token, with a coded error when no session runs, and verify tests
- [x] 19.3 Add MCP tools for graph queries, diagnostics, a request's logs and trace, function invocation, `check` and transactional `add`, and verify each tool in tests
- [x] 19.4 Verify with a build scan that production builds contain no `relkit mcp` entry point
- [x] 19.5 Extend the MCP Inspector CLI test to `relkit mcp` and run both MCP tests for every release, and verify them in CI
- [x] 19.6 Evaluate MCP elicitation for approval-required tools on `/mcp`, record the decision, and return an actionable coded error when approval is not possible, and verify the error test
- [x] 19.7 Add Inspector UI actions for publishing and replaying events, triggering jobs and retrying or cancelling event deliveries, and verify browser tests
- [x] 19.8 Add the Inspector page that lists MCP-exposed tools and calls them, and verify a browser test that calls a tool and opens its trace
- [x] 19.9 Run the agent evaluations in release readiness and record the pass rate as a CI output, and verify the pull request's run records it
- [x] 19.10 Document setting up `relkit mcp` for coding agents, and verify the docs build

## 20. Metrics and launch (#21)

- [ ] 20.1 Build the metrics page from CI outputs (creation canary, runtime matrix, benchmarks, agent evaluations, Railway test, package count) and link it from release notes, and verify it renders from the pull request's CI outputs and the release-notes generator test includes the link
- [ ] 20.2 Script the newcomer walkthrough (create to first route, create to Railway deploy) and record its timings, and verify the script runs end to end
- [ ] 20.3 Enable GitHub Discussions or a Discord, publish the roadmap with Core and Labs status, label about ten good first issues and set the repository description, and verify each item on the launch checklist
- [ ] 20.4 Write the launch checklist (P0 items, Railway newcomer test, community channels, roadmap) as a check, and verify it passes on the pull request

## 21. Vercel target (#12)

- [ ] 21.1 Add a Vercel generator (`vercel.json`, Node function entry, CI workflow) to `relkit deploy init`, and verify snapshot tests
- [ ] 21.2 Run schedules through Vercel Cron and jobs and events through the durable backend, and verify a scheduled run in an authorized preview deployment
- [ ] 21.3 Make `relkit check` report a coded error for WebSocket realtime without an external provider on Vercel, and verify the check test
- [ ] 21.4 Write the Vercel guide, run its newcomer deploy test, and move the target to Core when it passes, and verify the maturity table update

## 22. Workers runtime and Cloudflare target (#10, #12)

- [ ] 22.1 Implement the Workers adapter (fetch handler, no filesystem) and `relkit build --runtime workers`, and verify an HTTP-only app's suite in the Workers runtime
- [ ] 22.2 Add check diagnostics for providers that need a filesystem or long-lived process on Workers, and verify tests
- [ ] 22.3 Provide Workers-compatible clients for Redis, R2 and KV, and verify their conformance in the Workers runtime
- [ ] 22.4 Run jobs and events through Cloudflare Queues, schedules through Cron Triggers and realtime through Durable Objects, and verify an authorized deploy test
- [ ] 22.5 Add a Cloudflare generator (`wrangler.jsonc`, Workers entry, CI workflow) to `relkit deploy init`, and verify snapshot tests
- [ ] 22.6 Add Workers to the nightly matrix, write the Cloudflare guide, and move the target and the Workers runtime to Core when the newcomer test passes, and verify the maturity table update

## 23. One wire protocol (#16, second part; #8)

- [x] 23.1 Evaluate oRPC's OpenAPI-based link for dates, large integers, files and streams, record the decision in design.md, and verify with a spike test suite
- [x] 23.2 Switch the client transport from `/rpc` to the REST routes without changing user code, and verify the client test suite and a browser network test
- [x] 23.3 Remove the `/rpc` endpoint once no generated client calls it, and verify the HTTP tests
- [x] 23.4 Move off the oRPC 2.0 beta and resolve the drizzle-orm release-candidate pin under the dependency policy, and verify the policy check shows no unlisted pre-release in user installs

## 24. Agent adapters (#22)

- [x] 24.1 Define the agent adapter interface (run, stream, resume, stop, tool bridge, model profiles, state hooks, AG-UI mapping), and verify type tests
- [x] 24.2 Make `defineAgent` in `relkit` take a `runtime` adapter and a model profile, and verify type tests
- [x] 24.3 Port the LangChain integration onto the interface as `langchain({ ... })` with its native options, and verify its existing tests pass
- [x] 24.4 Build the shared agent conformance suite (tools, approvals, threads, streaming, access rules, traces), and verify the LangChain adapter passes it
- [x] 24.5 Implement the Vercel AI SDK adapter as an optional package, and verify it passes the conformance suite and that apps without it install no AI SDK package
- [x] 24.6 Supply the `model` capability from profiles bound in `relkit.config.ts`, and verify a profile rebind test
- [x] 24.7 Mark adapters and graph workflows Labs and update the agent docs and agent template, and verify the docs and template tests

## 25. Provider-author kit (#19)

- [ ] 25.1 Publish the jobs, events, cache, buckets and realtime conformance suites through `@relkit/testing`, and verify a first-party provider runs them from the packed `@relkit/testing` package
- [ ] 25.2 Write the provider-author guide and a starter package, and verify the starter's tests pass and it installs into an app
- [ ] 25.3 Publish the runtime, deploy-target and agent adapter interfaces with their conformance suites, and verify each first-party adapter runs them
- [ ] 25.4 Mark the provider contract Core, and verify the maturity table

## 26. Stability policy and 1.0 (#20)

- [x] 26.1 Add coded deprecation warnings that name the replacement, and verify a deprecated-API test
- [x] 26.2 Write the versioning and upgrades page with the stability policy, the 1.0 criteria and a target date, link it from the README, and verify it renders
- [x] 26.3 Add a release check that every breaking change has a `relkit migrate` rule and a changelog migration link, and verify it fails on a fixture
- [ ] 26.4 Update the root contributor guidance to link the maturity table and the stability policy, and verify the docs link check

## 27. Findings follow-ups (plan section 8.5)

- [x] 27.1 Make template `start` scripts run `relkit start`, and verify the template creation tests
- [x] 27.2 Make generated projects type-check after a fresh clone and install, and verify `tsc --noEmit` in a fresh-clone CI job
- [x] 27.3 Document that `relkit check` runs application top-level code and which side effects it blocks, and verify the docs build
- [x] 27.4 Document at-least-once delivery, re-runs after recovery and idempotency keys in the jobs guide, and the ephemeral event queue's overflow behavior in the events guide, and verify the examples compile
- [x] 27.5 Curate the API reference so each page leads with the most-used APIs and examples while keeping the complete reference, and verify the jobs page ordering in a docs test
- [x] 27.6 Type the HTTP client returned by `createTestApplication`, and verify type tests
- [x] 27.7 Evaluate OpenTelemetry semantic conventions and OTLP metrics export, record the decision, and verify a spike test exports metrics to a collector

## 28. Integration checks

- [ ] 28.1 Run full release readiness on the 0.9.0 candidate pull request — creation matrix on Tier 1 runtimes, TypeScript 5.9 and 7 matrix, benchmarks and agent evaluations — and verify every job passes
- [ ] 28.2 Run the newcomer walkthrough with `bunx create-relkit` and `npx create-relkit` resolving the packed candidate from a local registry, through to a Railway deploy, and verify the timings meet the metric targets
- [ ] 28.3 Run `openspec validate adopt-lead-review-plan --strict`, confirm each requirement has a passing test or recorded evidence, and verify the plan coverage table in design.md is current

## Release steps after merge

These are release operations, not tasks of this change. They run only after every task above is
complete and the change has merged.

- Publish `0.9.0-beta`, then `0.9.0`, and deprecate the final `@relkit/app` on npm.
- Announce the launch once the release is published.

## Workflow follow-up

- Archive this change after `lean-installation-and-standalone-inspector` is archived, rebasing these deltas if its text changes again.
- Write the follow-up proposal for escape hatches and eject (#17) with API examples and a way to prove that eject works.
- Revisit the stop-doing rules when Core reaches 1.0.
