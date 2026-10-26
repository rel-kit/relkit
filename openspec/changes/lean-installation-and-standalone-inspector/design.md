# OpenSpec: Lean Installation and Standalone Inspector

## Context

See `proposal.md` for motivation and capability changes. This design preserves the supplied brief section by section and incorporates the later review corrections in each owning section. All package destinations, commands and behavior below are implementation targets, not completed work.

Original audit: `7df7608ceabfc0765cb3aa2706823e6955bc782f`, October 20, 2026. Follow-up checkout review: `34dce6525b8b2b54fd7ca42842917706c442023a`. Recheck owners before implementation. Preserve unrelated live-development log changes and any other dirty work.

## Goals / Non-Goals

The four independently verified boundaries are actual consumer installation, evaluated JavaScript, consumed TypeScript declarations and generated production artifacts. Bundling an SDK does not remove its cost. Stage 1 must close before Stage 2 starts; no dependency reduction excuses functional regression.

Keep backend-first minimal/API/agent applications, ordinary TypeScript function/route/service authoring, Effect execution, Hono, essential oRPC, required platform adapters and compiler/editor TypeScript. Preserve existing selected frontend features. Do not add workflows, database/auth defaults, frontend assets or generic entity-discriminator endpoints, or change durable-task semantics.

This delivery writes only proposal/design/deltas/unchecked tasks beneath this OpenSpec change. Implementation, manifests, lockfiles, samples, main specifications, generated references and releases are future work. No Git operations, publication, cloud spend or destructive cleanup are authorized.

## Decisions

### Ownership and dependency direction

| Keep in lean paths | Move to explicit owners |
| --- | --- |
| Effect, required platform adapters, Hono, essential oRPC | LangChain/LangGraph/LangSmith execution and native types/helpers → `@relkit/langchain`; DeepAgents only for its selected capability |
| Generic declarations, contracts, engine, HTTP core, lightweight observability | DuckDB driver/worker/history → `@relkit/observability-local`, then acquired solely by inspector in Stage 2 |
| Compiler/CLI and TypeScript when development requires them | Next/React/React DOM and traced UI assets → standalone `@relkit/inspector`; private source workspace → `@relkit/inspector-ui` |
| Root/server client and general testing harness | React/TanStack/oRPC-query bindings and specialized helpers → isolated optional subpaths/integration testing exports |
| Lightweight integration metadata and deployment declarations | Selected deployment implementation and Pulumi SDK → deployment integration; no unconditional CLI edge |
| Lightweight creator prompts/rendering/transactions | Compiler-backed existing-project AST discovery/add/edit → CLI-owned scaffolding tooling |
| Backend/runtime service lifecycle | Existing CLI server-runtime implementation → engine-owned narrow internal export |
| Metadata-only integration catalog | Executable imports → independently selected integration packages |

Names identify responsibilities; reuse an existing correct module before adding a package. No core-to-concrete-integration dependency or creator/tooling/CLI cycle is allowed. Subpaths alone and `optionalDependencies` do not provide absent-until-selected SDK ownership. SDK optional peers plus compatible development dependencies preserve consumer ownership; small private dependencies required by a selected integration can remain ordinary dependencies.

Shared requirement/diagnostic contracts live below compiler/CLI and runtime. Compile-time discovery emits selected requirements; runtime validates them independently before readiness. No scanning every installed package or arbitrary configuration execution to enumerate hypothetical requirements.

### Stage policies

Stage 1 policy permits only an explicitly enumerated dependency path from legacy CLI inspection to its UI/history assets. The audit records exact edges and artifact paths; it must not grant a package-wide exemption. React in the generic client, DuckDB through application observability, agent implementation through inspector tooling and unrelated SDKs through CLI are forbidden in both stages. Stage 2 deletes all exceptions.

The permitted Stage 1 roots are the following paths, with every transitive installed/packed edge expanded and versioned in S1.1 evidence before it is admitted:

| Temporary path | Purpose and restriction |
| --- | --- |
| `@relkit/cli -> next` | Existing CLI-packaged inspector server only; no application runtime path. |
| `@relkit/cli -> react` and `@relkit/cli -> react-dom` | Existing inspector UI runtime only; no generic client or backend declaration exception. |
| CLI tarball `dist/inspector/` -> traced Next standalone UI assets/dependencies | Exact traced files/edges recorded by packaging inventory; not an exemption for every dependency of the CLI. |
| `@relkit/cli -> @relkit/observability-local -> @duckdb/node-api` | Proposed Stage 1 explicit legacy-inspector store acquisition; expand exact driver/native-binary edges from the packed store. No path through application observability is admitted. |

These paths do not permit agent execution SDKs in inspector tooling. The final policy has an empty exception set. S1.1 measures actual transitive paths rather than guessing native package identities or granting wildcard exemptions.

### Mandatory use-effect guidance

Every future code change is guided by [use-effect](/Users/mustafaelsayed/.codex/skills/use-effect/SKILL.md), its binding references/prerequisites, repository [Effect guidance](/Users/mustafaelsayed/Workspace/relkit/.agents/skills/effect/SKILL.md), root/nearest `AGENTS.md` and [boundary guidance](/Users/mustafaelsayed/Workspace/relkit/.agents/skills/konsistent-config/SKILL.md). Read task-specific references before coding; this is not satisfied by adding imports.

Use cohesive Context services, service-owned construction, typed Effect methods/workflows, live/test Layers and scoped execution where responsibilities warrant them. Effect owns state, failures, concurrency, retries and acquired resources; public ordinary TypeScript authoring, pure helpers, UI presentation and thin SDK/Promise adapters retain appropriate boundaries. Do not wrap unchanged Promise orchestration in nominal services.

For every selected API/pattern, inspect implementation, tests and examples in read-only `repos/effect`, its `.agents/AGENTS.md`/`LLMS.md` if present, and installed `node_modules/effect` against the pinned catalog version (review found 4.0.1). Note source gaps; never edit/install in the reference checkout.

Each task's completion includes per-file review through EOF, E/R contracts, test-Layer substitution, acquisition/method failures, original defects/mixed Causes/interruption, request-context isolation, bounded concurrency/retry, late acquisition and joined finalization, and standalone instrumentation through the actual configured logger. Apply the skill's tighter formatted 200-physical-line file and below-50-code-line function limits within the repository's 250-line maximum. Preserve precise types, TSDoc/checked examples and companion placement. New owning-package tests follow Vitest/@effect/vitest where applicable; retain existing Bun suite runners instead of wholesale conversion. Pure/non-runtime files receive a recorded applicable review, not artificial Effect services.

### Reviewed alternatives

- Keep SDKs bundled or dynamically import every feature: rejected because installation and declaration cost remain, and failures appear after readiness.
- Replace the compiler with a second parser/regex scaffold edits: rejected; existing AST discovery and transactional edits remain authoritative.
- Keep UI/store as CLI optional dependencies: rejected because these still install by default and blur process ownership.
- Rewrite the UI or introduce another plugin registry: rejected; reuse current UI/contracts and `relkit.integration`.
- Bind inspector identity to each reload generation: rejected because it rotates credentials unnecessarily and lets old cleanup damage current discovery.
- Deduplicate by span ID alone: rejected because it drops legitimate revisions; session/sequence envelope identity is independent of entity identity.
- Share diagnostic database ownership between backend/tool: rejected due competing writers and backend storage coupling.
- Copy only the JavaScript bundle into production: rejected when native/external modules or workers remain required.

## Detailed stage decisions and acceptance obligations

## Stage 1 — Lean core and opt-in integrations

### S1.1 — Establish dependency ownership and reproducible baselines

**Inspect:** every package manifest under `packages`, `integrations`, and `apps`; all starter variants; the package creator; the `relkit` wrapper; release/packaging scripts; and generated server/bootstrap imports. Classify root tooling and documentation dependencies separately from consumer dependencies.

**Produce:** a dependency-ownership matrix identifying each direct third-party dependency, its consumers, capability, runtime/build/test role, public-type exposure, and final owner. Inspect transitive paths rather than treating subpath exports, dynamic imports, or catalog metadata as installation boundaries.

Use packed artifacts and the existing scaffold-smoke infrastructure to measure these distinct scenarios outside the workspace:

| Fixture | Purpose |
| --- | --- |
| Creator only, before app installation | Bootstrap cost of `create-relkit` and the `relkit create` wrapper. |
| Minimal app with development dependencies | Actual new-project installation and everyday development. |
| API starter with development dependencies | REST, typed RPC, and generated-client behavior. |
| Built app with production dependencies only | Production artifact ownership and deployment footprint. |
| Generic client in a server-side consumer | No mandatory frontend bindings. |
| Agent starter and individual integration fixtures | Selected capabilities remain usable with their declared requirements. |

Record package names and versions, physical installed instances, compressed package bytes, logical and physical unpacked size where measurable, native artifacts, and cold/warm installation observations. Record OS, architecture, package-manager versions, and cache conditions. Do not mix a workspace lockfile count with installed consumer packages or sum shared dependencies repeatedly.

**Suggested files:** `scripts/check-consumer-dependencies.ts`, `scripts/benchmark-consumer-install.ts`, `scripts/consumer-dependency-policy.ts`, `scripts/tests/consumer-dependencies.test.ts`, and `docs/evidence/lean-install/baseline.json`. Reuse existing packed-manifest readers and registry fixtures.

**Acceptance:** the baseline is reproducible, explains the dependency paths already identified in the audit, and includes failing assertions for the final unwanted package families. Maintain separate Stage 1 and final policy gates; do not weaken the final policy to make intermediate work pass.


**Review clarification:** Retain failed/noisy observations. The baseline is historical evidence, not an implementation pass. Use the exact installed physical-instance and dependency-edge inventories, including bundled SDKs, so separate installation/runtime/declaration/artifact reports cannot hide cost.

### S1.2 — Establish the dependency policy and requirement metadata

Apply these rules consistently:

| Dependency kind | Policy |
| --- | --- |
| Required framework implementation | Normal `dependencies`. |
| Application-owned SDK for an optional capability | `peerDependencies` plus `peerDependenciesMeta.optional: true`, with a compatible development dependency for package tests. |
| Small private implementation dependency always needed by an explicitly selected integration | Normal dependency owned only by that integration. |
| Development/build-only tooling | Tool package or application `devDependencies`, never a hidden production requirement. |
| Platform-specific optional binary installation | Use `optionalDependencies` only for its genuine installation semantics, not as feature opt-in. |

Ordinary peers can be installed automatically by npm and Bun. Optional dependencies are also normally installed. Optional peers are the relevant mechanism for an absent-until-selected SDK; verify behavior with the pinned supported package-manager versions.

Use tested compatibility ranges, including correct prerelease handling. Do not use unbounded `*` ranges or assume all Relkit packages share one release version. Keep Effect versions aligned through the existing release catalog rather than independently bundling copies or making Effect optional.

Extend the existing `relkit.integration` manifest metadata and scaffold catalog. Do not create a second plugin registry or scan every installed package at application startup.

A shared dependency requirement should express approximately:

```ts
interface IntegrationDependencyRequirement {
  readonly package: string;
  readonly supportedRange: string;
  readonly installSection: "dependencies" | "devDependencies";
  readonly capabilities: readonly string[];
  readonly phases: readonly ("check" | "build" | "runtime" | "deploy")[];
}
```

Keep this metadata declarative and serializable. Generate published peer ranges, installation guidance, and compatibility assertions from one maintained source. Derive inspector tool requirements through the same policy in Stage 2 where applicable.

**Acceptance:** package packing preserves optional-peer metadata and emits valid published versions/ranges. Root build catalogs remain metadata, not evidence that every listed SDK is installed. No selected application-owned SDK is supplied accidentally by workspace hoisting.


**Metadata ownership:** Existing lightweight contracts/provider modules own the serializable requirement schema, selected-capability metadata, diagnostic contracts, and integration identity/version rules. Compiler/CLI own discovery, scaffold/add planning and phase validation; runtime modules own startup validation and lifecycle without importing CLI/compiler. Requirements attach to selected capabilities and phases, not every registration advertised by a package: Redis cache selection does not load or validate Redis agent-state peers. Preserve integration IDs, capability/adapter/protocol identities, deterministic order, duplicate rejection and export provenance. Update `scripts/build-catalog.ts`, `scripts/sync-release.ts`, release staging and template packing so regeneration cannot restore removed dependencies or erase optional-peer metadata.

### S1.3 — Implement selected-feature dependency preflight

**Primary owners:** existing integration discovery in compiler/provider code; CLI check/build/dev/deploy services; the production integration loader. Shared lightweight resolver helpers must live below the CLI so production does not depend on CLI services.

Resolve requirements from explicit configuration, descriptors, and discovered integration declarations. Reuse the existing declaration/import analysis to diagnose missing integration imports before eager config evaluation where possible. Do not execute arbitrary configuration merely to discover all possible packages or add a second full source parser.

Validate a dependency only when its capability is selected for the requested execution phase. Installing an unused optional integration must not activate it or start any services. Requirements for deployment must not become requirements for ordinary backend startup.

Resolve adapters from the consuming application's package boundary, then resolve their SDK peers with the selected adapter's correct resolver context. Respect package exports, workspaces, isolated layouts, and package-runner caches. Do not resolve from the globally installed or temporary CLI directory; do not assume every package exports its `package.json`.

Provide distinct machine-readable failures for a missing package, unsupported version, unsupported integration protocol, and an installed module that fails during initialization. Preserve the original initialization cause. Do not turn every `import()` failure into “please install this package.”

Diagnostics must identify the capability, source/config location when available, package, required range, installed version when present, and package-manager-specific install command. Aggregate safely discovered missing requirements rather than forcing repeated single-package attempts.

Example output shape:

```text
RELKIT_DEPENDENCY_MISSING

Capability: jobs.notifications
Required package: inngest
Supported version: <range from release metadata>
Source: <authored configuration location>

Install:
  bun add @relkit/inngest inngest@<compatible-version>
```

Check missing dependencies during `check`, build, and startup of a selected capability—not on its first business request. Loading a selected module at startup may remain lazy relative to unrelated commands, but readiness must not promise a selected feature that has not been validated.

Never install packages on import, in a request handler, or silently during dev/build. Existing interactive scaffold/add commands may offer an explicit install action and preview manifest changes. CI remains noninteractive. Preserve project package-manager choices and lockfiles; do not infer an npm project simply because its creator was launched through npx.

**Acceptance:** tests cover absent/incompatible peers, absent nested dependencies, config imports, monorepo package roots, isolated installs, and temporary CLI execution. Missing requirements cause no network calls, package changes, or lockfile mutation.


**Failure classification:** A missing nested dependency in an installed module is an initialization failure with its original cause; it is not proof that the selected package itself is absent. A compatible installed SDK can still fail for credentials/configuration. Runtime startup must revalidate selected requirements before readiness even if preparation previously succeeded. Check phase selection and multi-capability packages explicitly.

### S1.4 — Separate agent declarations from SDK-backed execution

**Inspect and update:** `packages/agents`, `packages/app/src/index.ts`, app agent subpaths, engine materialization, agent runtime loading, `packages/providers-local`, `integrations/packages/redis`, and all agent-facing contracts and tests.

Keep generic `defineAgent`, descriptors, events, state contracts, and capability metadata lightweight where their types can remain SDK-independent. Move LangChain/LangGraph execution and genuinely SDK-specific public types/helpers into an explicit integration, proposed as `integrations/packages/langchain` / `@relkit/langchain`.

Keep the practical authoring facade when possible; do not expose internal Effect plumbing or require redundant registration flags. The compiler must map selected descriptors to explicit runtime requirements using the integration mechanism. If a public helper is intrinsically a native SDK API, move it to the integration entry point and update consumers rather than pretending it is vendor-neutral.

Move native graph execution, model/tool conversion, SDK middleware types, checkpoint implementations, and SDK-specific telemetry with their owning integration. Preserve the existing distinction between agent execution graphs and job/task semantics; do not introduce a new workflow abstraction.

Keep DeepAgents conditional on actual DeepAgents capabilities. Make its optional loader use the shared error/version policy without masking initialization failures. Keep validation and resource cleanup behavior intact; small engine-only validation libraries can remain normal dependencies of that engine integration.

Redis cache/realtime and local cache/bucket/job functionality must not require the agent engine. Place shared agent-state contracts below SDK implementations and register only the selected Redis/local capabilities. Preserve state identity, durable versions, retries, cancellation, and task/job behavior.

**Acceptance:** root app imports, REST/RPC apps, Redis-cache-only fixtures, and generic local-provider fixtures run without LangChain, LangGraph, LangSmith, or DeepAgents. Agent fixtures still exercise streaming, tools, state, interruption/resume, and persistence with their explicitly installed dependencies.


**Review cases:** Test missing selected dependencies after preparation and installed integrations with missing unused peers. Native engine registration is derived from selected descriptors; cache/realtime/bucket/jobs registrations must neither evaluate agent execution nor require redundant engine flags. Preserve interruption/resume, persistence, durable versions and state identity, as well as streaming/tools.

### S1.5 — Isolate optional HTTP transports and documentation UI

**Inspect and update:** `packages/runtime-hono/src/index.ts`, `create-app.ts`, `create-rest-app.ts`, `prepared-app.ts`, `prepared-transports.service.ts`, MCP/agent-protocol/API-docs modules, and the generated endpoint initialization paths.

Keep Hono and essential oRPC transport infrastructure in the supported core. Separate MCP, AG-UI, and the Scalar documentation UI into isolated optional entry points within the existing runtime package unless a genuine package-level boundary is needed. Declare their externally owned SDKs as optional peers; subpath isolation alone is not enough while they remain ordinary dependencies.

Replace the shared “load the complete application for any deferred transport” behavior with selected-capability loading. Ordinary typed RPC must not import MCP or agent implementations. Preserve generation-owned, single-flight initialization, context handling, and joined disposal.

Keep OpenAPI document generation independently usable without Scalar. Documentation UI is explicitly selected; a minimal app must not promise a UI that cannot load without its dependency. Reuse existing settings where possible and add only the minimum configuration needed to express opt-in.

Classify endpoint families before moving them. Public streaming, realtime, jobs/client APIs, application health, and normal typed RPC must not be accidentally gated behind optional inspection. Preserve authentication, body limits, origin checks, rate-limiting policy, and request logging exactly once per request.

**Acceptance:** REST and RPC work without MCP/AG-UI/Scalar installed. Selecting each optional feature validates its requirement before readiness. Tests cover concurrent initialization, request cancellation, middleware ordering, hot-reload retirement, and SDK failure.


**Endpoint ownership decision:** Do not move everything under `/_relkit/v1` together. Development activation/readiness probes, including live graph/generation/route-table/cohort proof for no-example projects, remain core. Client identity, public jobs, streaming, realtime and typed RPC remain application transports with their current identity/authentication and operation-ID behavior. Rich graph/resource queries and inspector administrative actions move to the optional bridge; history queries move to the tool. Test core endpoints with inspection disabled and production enable-overrides attempted. Preserve per-request context isolation, middleware order, cancellation, exactly-once request logs and joined retirement of generation-owned initialization. Scalar is explicitly selected and preflighted; OpenAPI generation does not require it.

### S1.6 — Remove frontend and optional-provider leakage from clients, auth, and tests

**Client:** update `packages/client/package.json` and its root/server/React/TanStack entry points. Make frontend peers optional; isolate the direct `@orpc/tanstack-query` dependency as well. Either make it an optional peer at its isolated entry point or place it in a genuinely opt-in adapter package. Do not solve React installation while still requiring every TanStack integration from the generic client.

Preserve the exact `DefaultContractRegistry` augmentation authority, generated-client type inference, and supported server-side behavior. Unused entry-point declarations must not require React or TanStack types. Do not widen runtime support claims without tests.

**Auth and database:** update `packages/better-auth` and `packages/drizzle`. Application-owned SDKs follow the peer policy, React belongs only to the React entry point, and native database drivers are selected rather than installed as a bundle. Separate a Drizzle-specific bridge from unrelated auth surfaces when needed. Preserve actual upstream requirements rather than concealing them; selecting auth or a database can legitimately add its real SDK graph.

**Testing:** refactor `packages/testing` into a lightweight general harness with isolated capability-specific helpers. Use existing feature subpaths or the owning integration's testing export. Remove hard dependencies on auth, Drizzle, agent engines, and their SDKs from the general harness. Do not fix installation counts by deleting useful starter tests.

For all three, audit emitted declarations with strict consumer typechecks and `skipLibCheck: false`. Do not use ambient module stubs, `any`, or suppressed errors to simulate optionality.

**Acceptance:** generic-client, backend-auth-without-React, and minimal-test fixtures install and typecheck independently. Selected frontend/auth/database/agent-testing fixtures pass with only documented dependencies.


**Declaration proof:** Consume packed root/server/client/testing declarations with `skipLibCheck: false`, including generated `DefaultContractRegistry` augmentation, positive inference and negative misuse cases. Preserve actual upstream dependencies for selected auth/database/frontend functionality. Do not infer optionality from unused runtime imports alone.

### S1.7 — Separate deployment and production runtime ownership

**Inspect and update:** `packages/cli`, `packages/deploy`, `packages/deploy-pulumi`, `packages/cloud-aws`, `integrations/packages/aws`, `integrations/packages/pulumi`, and generated server/deployment output.

Keep deployment parsing/help in the CLI but resolve the deployment engine through selected integration metadata. Remove the CLI's unconditional Pulumi implementation edge. Audit authoring metadata, local recipes, and deployment exports so declaring configuration does not eagerly load Pulumi/AWS SDKs.

Ensure the selected deployment integration actually owns/resolves its implementation; simply deleting the CLI dependency can otherwise leave deployment working only in the workspace. Provider SDKs needed only for deployment stay out of the production server artifact. Configuration imports must not reintroduce them at runtime.

Move server-runtime lifecycle code that belongs to production out of `packages/cli/src/server-runtime` into a runtime-owned internal module, proposed as `packages/engine/src/server-runtime`. Expose a narrow runtime-owned internal export and update generated imports. Preserve cancellation, readiness, late-acquisition cleanup, shutdown ordering, and failure reporting; do not rewrite lifecycle semantics as part of moving files.

Define and test the production launch contract. A generated server must run after a production-only dependency installation, without relying on the development CLI. Keep `relkit start` as a convenience delegation where installed, but make the starter's documented production start path independent of a dev-only binary. Derive the real generated entry path from the build implementation rather than inventing it.

Build output must include or declare every selected runtime dependency, preserve required native artifacts, and exclude unused integrations. Update prepared snapshot fingerprints to include relevant integration versions, dependency selection/lockfile changes, and configuration. Do not let a previously prepared app hide a newly missing SDK.

**Acceptance:** minimal build/start works without Pulumi, the development CLI, inspector assets, or optional SDKs in the production installation. Selected deployment planning tests still pass without performing cloud deployment.


**Verified entrypoint decision:** The current build emits TypeScript source and JavaScript runtime output. Generated scripts/documentation use:

```bash
NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js
```

The engine is the intended owner of a narrow internal server-runtime export. Verify working-directory behavior, relative paths, runtime environment requirements, relocation and shutdown outside the checkout. The generated Dockerfile/copy allowlist must contain every selected external module, native binary, worker and required asset; copying only `server/index.js` is insufficient when dependencies remain external. Production-only installs must omit CLI/compiler/inspector/Pulumi and unselected SDKs. Removing or upgrading a selected SDK after preparation invalidates reuse before readiness, including when the lockfile itself was not changed. No cloud deployment is part of the planning or local gate.

### S1.8 — Split observability contracts from local persistence

**Inspect and update:** `packages/observability/src/local`, its package exports, runtime-effect logger integration, inspector API, supervisor, and CLI telemetry ownership.

Keep event contracts, normal logging, redaction, basic telemetry, and bounded in-memory interfaces in lightweight observability code. Move DuckDB and its driver/worker/database implementation to a separately owned local store, proposed as `packages/observability-local` / `@relkit/observability-local`.

Use a store interface so telemetry producers do not import storage implementation types. Keep redaction before transport/storage boundaries. Preserve normal console logging without a local database.

During Stage 1 only, the legacy CLI inspector path may explicitly acquire/inject this store for compatibility with the current inspector. Neither app authoring nor production runtime may have a hard dependency on the store. Test the legacy inspector path rather than assuming that moving its manifest preserves functionality.

Do not move durable job/provider/agent application state into this observational store. Do not remove local history files or reset existing schemas.

**Acceptance:** application observability imports and production artifacts contain no DuckDB dependency. Legacy inspector/history tests remain green through the explicit Stage 1 tooling boundary.


**Store interface:** Producers depend on lightweight contracts, not concrete store/driver types. Console and production JSON logging work without persistence. Stage 1 explicitly acquires/injects the local store only through documented legacy CLI inspection paths. Preserve existing schema/history and test the store through that temporary boundary; never move durable jobs, provider data or agent checkpoints into diagnostic storage.

### S1.9 — Slim project creation and integration catalogs

**Inspect and update:** `packages/create-relkit`, `packages/relkit`, CLI create/add handlers, source-edit/project-discovery modules, scaffold catalogs, templates, and release/template packaging scripts.

Separate new-project generation from existing-project AST editing. Move compiler-backed discovery/editing/add machinery to CLI-owned tooling, proposed as `packages/scaffolding` / `@relkit/scaffolding`, or an equivalent existing tooling package. Keep TypeScript AST editing there; do not replace it with regex edits.

The standalone creator should own prompting, supported template selection/rendering, filesystem transactions, package-manager selection, and explicit install/Git consent. Remove compiler/TypeScript dependencies from the creator once no generation path requires them. Where validation needs the full compiler, run it in template certification or through the installed project CLI after an authorized install. `--no-install` must not fetch a compiler or execute generated application code.

Audit root creator exports so re-exporting add/edit functions does not retain the heavy dependency graph. Prevent a creator/tooling/CLI dependency cycle.

The `relkit` launcher must not unconditionally install the entire CLI just to execute `relkit create`. Keep creation lightweight and delegate project commands to the project's installed CLI with version-aware diagnostics. Avoid binary recursion and do not install both wrapper and CLI into the starter unnecessarily. Test both direct creator and wrapper entry points through supported package runners. Bun remains the application runtime; launch errors must explain a missing Bun prerequisite rather than imply npx makes the backend Node-compatible.

Make `integrations/catalog` metadata-only instead of directly depending on all integration packages. Update executable provider imports to standalone integration packages. Since current consumers are repository samples, update them directly rather than maintaining a legacy umbrella implementation that reinstalls everything.

Minimal/API starters install only their actual core, compiler/CLI, general testing, and typechecking requirements. The agent starter includes the chosen agent integration and its exact documented requirements. Database/auth/cloud/jobs options add only selected dependencies. Preserve `.relkit/` ignore rules and generate no unsolicited frontend for backend starters; explicitly selected fullstack functionality remains supported within its existing certification boundary.

Do not remove or rewrite the existing Drizzle patch merely to hide package installation. Apply feature-specific patch handling only where that SDK is selected; evaluate patch removal separately with compatibility evidence.

**Acceptance:** creator-only fixtures are lightweight, all starter choices still work, no-install mode has no installation side effects, and default documentation no longer routes users through an install-everything catalog.


**Scaffolding boundary:** Use CLI-owned scaffolding tooling for existing-project compiler/AST discovery and edits. Reuse equivalent modules before creating `@relkit/scaffolding`; avoid creator-to-tooling-to-CLI cycles. A creator-only `--no-install` run does not fetch a compiler or execute generated application code. Full compiler validation runs in certification or through the installed project CLI after authorized installation. Keep minimal/API/agent backend-first while preserving explicitly selected fullstack functionality. Preserve the current Drizzle patch bytes and its version/registration; apply repair handling only when its SDK is selected. Keep the complete `.relkit` ignore.

### S1.10 — Stage 1 verification and completion gate

Add packed, isolated consumer tests for the following cases. Do not rely solely on monorepo tests where development dependencies can mask missing imports.

| Test | Required assertion |
| --- | --- |
| Minimal and API starters | Check, strict typecheck, tests, REST/RPC, build, and production start succeed. |
| Generic client | No frontend packages/types required; generated augmentation remains precise. |
| General test harness | No auth/database/agent SDK requirement. |
| Optional integrations | Absence is safe when unused; selecting a missing/incompatible implementation fails before feature readiness. |
| Mixed capabilities | Representative cache + realtime, jobs + auth, and agents + tools combinations work without duplicate registration. |
| Module failure | An installed module's internal import error is not rewritten as a missing optional package. |
| Installation layouts | Bun normal and isolated layouts, npm, and pnpm consumer fixtures; supported bunx/npx creation flows with Bun available. |
| Production | No CLI/compiler/dev-only import leakage, no optional SDK bundled accidentally, selected native dependencies work. |
| Legacy inspector | Still functional only through the explicitly allowed Stage 1 tooling dependencies. |

Use real packed artifacts resolved through the existing isolated registry test infrastructure or a similarly controlled fixture. Do not let unresolved workspace dependency specifiers fetch unrelated published versions. Test actual published manifests, including peers, native artifacts, and template files.

Suggested test areas: `scripts/tests/consumer-dependencies`, `tests/types/optional-dependencies`, and existing CLI/runtime/client/scaffold suites. Extend the repository boundary checker to prevent core-to-SDK and core-to-inspector-storage edges from returning.

**Stage 1 is complete only when** selected features retain their behavior, package absence/type isolation tests pass, baseline comparisons are recorded, release metadata/changesets and affected docs/examples/skills are updated, and the only remaining final-policy exceptions are the enumerated legacy inspector paths. Report results for creator, development, and production separately; do not invent a reduction percentage.


**Gate closure:** Include Bun normal/isolated, npm and pnpm installations, supported bunx/npx entrypoints, generic-client strict inference, minimal testing without provider SDKs, selected native production dependencies/workers, accurate initialization failures, and cache+realtime, jobs+auth, agents+tools without duplicate registration. Release metadata/changesets, docs/examples/skills must agree. Only enumerated CLI legacy-inspector UI/history paths may violate the final policy; all other functional/isolation checks pass before Stage 2. Preserve the active `separate-release-readiness-performance` proposal and report functional readiness independently of strict one-second performance certification.

---

## Stage 2 — Standalone inspector and inspector-owned persistence

### S2.1 — Define the application/tool separation and configuration

Treat these as independent actions: enable the application inspection bridge, install the inspector tool, and run the tool. Installation never enables inspection; configuration never launches a UI.

The proposed common configuration is:

```ts
export default defineApp({
  env,
  server: { port: 3000 },
  inspector: { enabled: true },
});
```

Omitted inspector configuration means disabled. An explicit disabled setting must remain effective even when the inspector package is installed.

Use a separate bridge listener, loopback-bound with an OS-assigned free port by default. Record its actual address in the private connection descriptor. Support explicit bridge address/port settings for controlled container development, for example under `inspector.connection`. Keep the inspector UI port in the inspector command, not in application configuration. Do not silently reinterpret the old `inspector.port` field: update samples and provide an actionable validation message for obsolete configuration, not a new compatibility subsystem.

Keep the existing inspector UI default port, `3210`, as a tool default. New minimal/API/agent starters omit inspector configuration and the inspector dependency unless an explicit inspector option is selected.

Inspection is development-only in this change. Normal production build/start must not register the bridge or expose inspector routes. Do not expand this task into a remote-production inspection product.

**Acceptance:** disabled apps acquire no inspector listener, process, database, connection file, or inspector-specific background worker. Enabled apps expose the lightweight bridge without requiring a locally installed UI/storage tool, so Docker or an explicitly invoked package-runner tool can connect.


**Configuration decision:** Omitted inspection is disabled. `inspector: { enabled: true, connection: { host: "127.0.0.1", port: 0 } }` enables only the bridge; omitted `connection` uses those defaults. UI port is a standalone-command setting, default `3210`. Reject obsolete `inspector.port` with correction guidance instead of reinterpreting it. Test disabled, installed-but-disabled, enabled-without-tool, and production enable-attempt separately. Production builds exclude rich inspection registration; legacy internal-endpoint environment overrides cannot enable the bridge or rich APIs. Core readiness remains independently available.

### S2.2 — Package the existing UI and launcher separately

**Inspect and update:** `apps/inspector`, `scripts/package-inspector.ts`, CLI build scripts, monorepo package selectors, and release packaging.

The existing private UI workspace already uses the name `@relkit/inspector`. Rename that private workspace to `@relkit/inspector-ui` before creating a separate publishable `packages/inspector` / `@relkit/inspector` launcher/distribution. Update every filter, script, and reference; never leave duplicate workspace package names. Verify package publication authority/availability through the normal release process before publishing.

Move inspector packaging output from `packages/cli/dist/inspector` into the new inspector distribution. Remove Next, React, React DOM, inspector UI assets, and local-history storage from the CLI's published dependency/asset graph. Do not move those packages to CLI `optionalDependencies`.

The standalone distribution owns its launcher, UI server, collector, and storage worker as one scoped process tree. Reuse the current Next UI and its proven server execution path; no frontend rewrite. Document and validate the required tool runtimes. The backend-only Bun workflow must not acquire a new Node prerequisite merely because the optional inspector uses a Node/Next server.

Package all necessary traced UI assets and runtime dependencies without checkout-relative imports. Keep package-runner caches read-only with respect to application state. Place project history in the project data location, not inside the inspector package or execution cache. Include licensing and supported native-platform metadata.

Proposed tool usage after this implementation:

```bash
bun add -d @relkit/inspector
```

Prefer a project script for routine use so package-manager binary resolution is unambiguous:

```json
{
  "scripts": {
    "dev": "relkit dev",
    "inspector": "relkit-inspector --project-root ."
  }
}
```

Then run `bun run dev` and `bun run inspector` in separate terminals. A separately documented, explicitly invoked package-runner mode may install the standalone tool into the runner cache; test its real command syntax against supported runner versions. It must not modify application dependencies or replace the canonical project-script workflow.

**Acceptance:** the packed inspector runs outside the monorepo, the packed CLI contains no inspector distribution, and minimal backend installation has no frontend dependencies. Uninstalling the inspector leaves backend development intact.


**Launch contract:** In addition to `--project-root`, support explicit connection-file, credential-file, reachable target-address and persistent history-directory inputs for Docker. Browser requests cannot change those launch-time choices. Validate tool runtime prerequisites, licenses, native-platform support and traced assets using packed execution; do not claim public package/image availability before authorized release.

### S2.3 — Remove inspector ownership from `relkit dev`

**Primary files:** CLI `dev-inspector*`, `dev-process*`, `dev-session*`, `dev-engine*`, port resolution, doctor checks, command metadata, generated/prepared startup, and related tests.

Remove unconditional inspector installation lookup, UI process spawning, UI port probing, readiness polling, and reinstall-CLI errors. Remove the inspector UI's ownership from backend shutdown. Do not retain a silent auto-download fallback.

`relkit dev` owns the app and its normal development lifecycle. If inspection is enabled, that app lifecycle may acquire the lightweight bridge, but not the inspector UI or storage. Runtime bridge failures after startup must degrade inspection without crashing business requests; invalid explicit configuration should fail normal validation clearly. Inspector disconnection is not application unreadiness.

Keep ordinary reload, local service, graph, logging, and prepared-start behavior. Invalidate old prepared snapshots when bridge/feature policy changes; do not reuse serialized session credentials.

Do not introduce a new `relkit inspector` convenience command in the initial implementation. Direct standalone execution is canonical and sufficient. If an existing alias is retained, it resolves only a locally installed tool, reports actionable absence, and never downloads or makes the tool a hard CLI dependency.

Update doctor so unused inspector prerequisites and ports are not checked. Classify every CLI command that currently uses inspector endpoints: live jobs/provider operations must remain usable without the UI; historical inspection commands should use the optional tool boundary rather than import DuckDB into the core CLI.

**Acceptance:** default dev works with no inspector package/assets, Next, React, DuckDB, or Node UI server installed. Stopping dev does not kill an independently launched inspector; stopping the inspector does not stop dev. Hot reload reconnects without duplicate listeners or leaked resources.


**Session lifecycle decision:** The bridge belongs to the development-session runtime, not a disposable generation. Listener, credential and discovery identity remain stable across successful reloads. Switch its active-generation reference only after candidate validation; rejected candidates leave the previous target active. A complete dev-session restart creates fresh identity/credentials. Old-generation finalization cannot remove the live session descriptor. Invalid connection configuration fails normal validation; valid configuration whose bridge cannot bind or subsequently fails reports inspection unavailable without making a healthy backend unready or creating unbounded retries. Prepared snapshots contain no reusable secrets. Test independent lifetimes, repeated reload, rejection, bind failure, reconnect and cleanup.

### S2.4 — Implement the lightweight inspection bridge and connection descriptor

**Primary owners:** refactored `packages/inspector-api`, shared inspector protocol contracts, application runtime acquisition, and standalone inspector connection code. Keep the bridge free of UI, DuckDB, compiler, and SDK-specific implementation dependencies.

Reuse existing inspection contracts/routes where appropriate, but separate historical-storage APIs from live application inspection. The standalone server queries its own history and forwards authorized live operations to the bridge. Public business/client endpoints remain on their established transports.

Create a private connection descriptor under an ignored `.relkit` connection directory. Include protocol version, project identity, a fresh session ID, actual endpoint, process identity metadata, creation time, and session authentication material. Never include full configuration, arbitrary environment variables, model keys, database credentials, or business payloads.

Generate credentials per running bridge session, not per build snapshot. Create the directory/file with owner-only access where the platform permits it, using atomic replacement and containment/symlink checks. Do not overwrite or remove another active session's descriptor. On shutdown remove only the descriptor owned by that session. Validate live session identity through a handshake; PID existence alone is not sufficient.

The inspector must support `--project-root` discovery and explicit connection/credential-file options for container usage. Read discovery metadata without importing/executing the user's config merely to locate a running app. Do not accept arbitrary file paths or targets supplied by browser requests.

Authenticate every inspection operation. Keep the app token server-side in the inspector process, never in URLs, browser bundles, or ordinary logs. Apply origin/host validation, request limits, and appropriate protection for state-changing UI requests. Default to loopback; non-loopback/container access requires explicit binding and credential/network configuration. Do not expose an unauthenticated development control API.

Version protocol and storage independently. Handshake on protocol compatibility, project/session identity, and available capabilities. Agentless apps report agents unavailable rather than forcing an SDK import. Native control actions remain executed by the application's runtime/providers under existing validation and authorization.

**Acceptance:** missing/wrong tokens, untrusted origins, incompatible protocol, stale discovery, two projects, restarts, and symlink/ownership cases are tested. Enabling the bridge without the tool works; unavailable optional capabilities return structured results without importing their SDKs.


**Discovery decisions:** Publish session-specific files under ignored `.relkit/connections/`. One compatible live session connects only after an authenticated identity handshake; no live session produces disconnected status with bounded rediscovery; multiple compatible live sessions require explicit connection-file selection rather than newest-file selection. Stale, incompatible or foreign descriptors are reported/rejected without reusing their credentials or deleting foreign files. PID liveness alone is not identity proof. A stale generation-bound control request is rejected or reconciled by existing operation identity, never silently sent to an unrelated generation. Lost mutation responses are not blindly retried: preserve existing operation IDs/idempotency semantics. Protocol and store versions are independent.

### S2.5 — Move history ownership and collection into the inspector

Reuse the Stage 1 local store implementation. The standalone inspector becomes the single owner of DuckDB writes, history queries, retention, and storage workers. The application publishes redacted records and serves live inspection without owning a DuckDB database.

Reuse the current project history location/schema when safe. Preserve existing history and data. Detect another writer and report an actionable conflict; never solve locking by deleting the database. Required schema upgrades must be non-destructive and tested. Do not introduce a separate legacy migration command or move/delete durable task/provider state.

Specify bounded collection semantics: maximum record size, queue bytes/count, retained pre-connection records, per-subscriber backlog, and bounded shutdown flushing. Keep redaction before recording or transport. Use session plus monotonic sequence identity for deduplication and reconnection.

Inspector absence, slow consumers, full storage, or worker failure must not block application requests or stop task execution. Expose dropped-record/gap information honestly. A bounded development buffer does not promise complete historical capture before the inspector connects.

Keep durable jobs, checkpoints, task retries, provider caches, and business state separate from diagnostic history. Removing the inspector must not change their durability or execution guarantees.

Maintain current inspector capabilities—graph, traces, logs, job views, agent views, and supported actions—when the relevant application features are selected. Adapt existing browser tests to prove functionality, not merely that the UI homepage loads. Agentless applications need usable empty/unavailable states.

**Acceptance:** single-writer and restart tests pass; preserved history remains readable; collector failure does not fail the app; bounded-memory and dropped-record tests pass; selected feature inspection retains behavior without requiring those SDKs inside the UI tool.


**Concrete bounds and durable acknowledgement:**

| Boundary | Initial default or hard ceiling |
| --- | --- |
| Early/pre-connection retention | 2,048 records and 2,097,152 encoded bytes |
| Early-retention configurable ceilings | 65,536 records and 67,108,864 bytes |
| Individual encoded record | 1 MiB including envelope accounting |
| Persistence batch | 256 records and 1 MiB |
| Persistence pending queue | 4 MiB and 2,048 records |
| Flush batching | 100 ms |
| Subscriber queue | Default 64 records; maximum 256 records and 1 MiB per subscriber |
| Aggregate bridge subscriber backlog | 4 MiB |
| Support flush deadline | Five seconds; disclose incomplete history on expiry |

Early-retention and batching values are existing baselines. The added pending-queue record ceiling, byte/count subscriber ceilings and aggregate bound are proposed requirements, not claims about current implementation.

Redact before memory/transport and validate decoded records at the receiver; an in-process WeakSet/redaction brand does not survive JSON. Envelope identity is session plus monotonic sequence, with generation attribution for old in-flight work. Persist identity and record atomically before advancing durable acknowledgement. A lost acknowledgement after commit replays without duplicate committed envelopes; later revisions of a span/request receive distinct sequence identities and remain valid updates. Disconnect before commit replays retained records. A cursor outside retention produces an explicit gap and resumes available records. Failed/uncommitted writes are never durably acknowledged.

Overflow uses deterministic eviction/rejection, independent loss counters and coalesced diagnostics. Slow subscribers are disconnected/dropped under the bounded policy instead of blocking requests. Tool absence, disk-full, permission/corruption errors and worker crashes use bounded recovery and preserve the original business outcome. Flush deadlines do not promise complete early capture.

Preserve the existing project `observability.duckdb` location/data. Detect competing writers without deleting the database. Docker requires an explicitly configured persistent history volume bound to project identity; reject another project's volume rather than merging it. Schema evolution is non-destructive and independent of protocol version. Agent durable streams/checkpoints, jobs/retries and caches remain separate from lossy diagnostic capture. Browser acceptance exercises real graph/trace/log/job/agent actions and unavailable states, not only the homepage.

### S2.6 — Deliver an independent Docker distribution

Add a dedicated inspector Dockerfile and the repository's existing release/CI integration for building it. Provide a versioned image and a documented local build path; do not claim a public image exists until the authorized release publishes it.

The image must contain the required inspector runtime(s), UI assets, and native storage dependencies. Run non-root, handle termination signals correctly, provide an appropriate liveness/readiness health check, and persist history in an explicit volume. Keep listening/disconnected and connected-ready states distinguishable.

Publish the browser UI to host loopback by default. Do not require the application repository, its `node_modules`, its environment, or the Docker socket to inspect a running backend. Mount only the narrow connection/credential material needed, read-only, and a history volume.

Document and test both an app on the host and an app on a private Docker network. A container cannot reach an app listener bound only to the host's loopback merely by using a host alias; explicitly configure the bridge binding, target address, authentication, and host/network restrictions for that case. Include the supported Linux host-gateway configuration and Docker Desktop path, with limitations stated accurately.

Avoid passing tokens as command-line values. Use credential files or a controlled secret mount, and preserve project/session verification when overriding a target address.

**Acceptance:** Docker inspection works without installing the inspector npm package in the app. Persistence survives container recreation, restart/reconnection works, network exposure remains restricted, and documented host/network examples are executable.


**Restart and networking decisions:** Mount the narrow connection directory read-only, not one atomically replaced file: directory mounts must observe replacement descriptors and credential rotation after a dev-session restart. Use files/secret mounts, never token command arguments. Explicit target overrides still require project/session handshake. Provide executable Docker Desktop host-app, Linux host-gateway and private-network configurations with explicit bridge binding and restrictions; a host alias cannot reach a loopback-only listener. Distinguish UI listening/disconnected from authenticated connected-ready health. Verify no app-local inspector dependency, persistence across recreation, rotations, multiple-session ambiguity, signals and restricted mounts.

### S2.7 — Update documentation, skills, templates, and release boundaries

Update root documentation and the affected `AGENTS.md` defaults; CLI/API/config references; inspector/local-development/Docker guides; templates and their READMEs; relevant examples; package manifests; release metadata; and canonical agent-skill material. Regenerate copied/generated references through the existing scripts rather than editing generated output by hand.

Integration documentation must start with actual install requirements, supported versions, and configuration/import examples. The SDK is installed in runtime dependencies when runtime needs it; local tool installation uses development dependencies. Commands and manifests must agree with the shared requirement catalog.

Inspector documentation must explain enabling, installing, running, disabled behavior, separate UI/bridge addresses, local tool prerequisites, Docker connectivity, bounded capture, history ownership, and production exclusion. Include both a lean backend example and an explicitly inspected example.

Record intentional config/import changes and update repository consumers directly. Do not retain compatibility re-exports that recreate the unwanted installation graph. Coordinate package versions through existing release machinery; do not publish automatically or assume every package receives the same version.

**Acceptance:** generated docs, examples, skills, and packed templates agree. No normal guide claims `relkit dev` starts a bundled inspector, and default setup does not install a frontend or every integration.


**Repository registration:** New/renamed packages participate in TypeScript references, Turbo tasks, structural checks, export smoke, API/documentation generation, packing, changesets and release classification. Update authoritative producers instead of weakening checks or hand-editing generated references. Repository-owned canonical skills and distributed template copies must agree; do not edit globally installed or third-party skills as an implicit side effect.

### S2.8 — Final acceptance and regression gate

Remove every Stage 1 inspector exception from the consumer dependency policy. Enforce the final target against actual packed consumer installations and production output.

| Scenario | Required result |
| --- | --- |
| Minimal/API creation | No Next, React/React DOM, Pulumi, LangChain/LangGraph/LangSmith, DuckDB, auth/database SDKs, MCP, AG-UI, or Scalar UI unless a selected capability genuinely requires them. |
| Default dev | Backend, watch/reload, logging, check, tests, and typed RPC work with no inspector tool or storage installed. |
| Installed but disabled inspector | App exposes no inspection listener and starts no inspector-owned worker/process. |
| Enabled bridge, tool absent | App runs and provides an authenticated bridge for an independently started tool/container. |
| Standalone local inspector | Existing selected-feature views and actions work; app/UI lifetimes remain independent. |
| Protocol and security | Authentication, origin controls, stale sessions, cross-project isolation, incompatible versions, and malformed payloads fail safely. |
| History and failure | Single-writer persistence, restart, redaction, queue limits, dropped-record reporting, and storage/collector failure are covered. |
| Docker inspector | Works without app-local inspector installation or broad mounts; documented network cases and persistence pass. |
| Production-only installation | Built server starts without CLI/compiler/inspector dependencies; no inspection listener is exposed. |
| Packaged delivery | Creator, CLI, app, selected integrations, and inspector artifacts contain valid manifests, required assets, and no checkout-only paths. |

Compare final results with S1.1 using the same fixture, OS/architecture, dependency versions where applicable, and measurement method. Record separate creator/development/production/inspector results. Hard-fail forbidden dependency regressions; set numeric size/count budgets from verified measurements rather than an arbitrary promised percentage. Treat noisy time measurements as evidence, not an unexplained strict threshold.

Use the repository's existing release certification as well as new isolated tests. Docker/browser/native tests must actually run in an appropriate environment before marking final acceptance complete. A skipped test is not a passing test.


**Review closure:** Explicitly include core health/client identity/jobs/RPC with inspection disabled; production environment override attempts; lost acknowledgement plus later span revision; two sessions plus Docker descriptor rotation; and relocated production-only native/worker execution. Every temporary path exception is removed. Required browser/container/native checks execute in an appropriate environment; unavailable checks leave final acceptance incomplete. Hard failures enforce forbidden dependencies; numeric size/count budgets come from measured baselines, never invented reduction percentages or unexplained noisy timing thresholds.

---

## Verification commands and evidence

Use the current checkout's scripts and required build order. Regenerate the lockfile intentionally after dependency changes, then verify frozen installation. The following are repository verification commands, not a claim that they have been executed for this plan:

```bash
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test:packages
bun run test:compiler
bun run test:contracts
bun run test:integration
bun run test:generator
bun run test:examples
bun run test:docs
bun run test:deployment
bun run test:security
bun run test:inspector
bun run build
bun run test:certification
bun run verify
bun run prepush
```

Also run the new consumer-install/type-isolation suites and focused lifecycle tests. With Docker and browser prerequisites available, run the inspector browser/container/scaffold coverage and `bun run prepush:full`. Use the repository's opt-in rules; do not enable real cloud deployment or paid integration tests without authorization.

For each task, record changed responsibility boundaries, commands actually executed, results, and unresolved failures. Existing unrelated failures should be identified precisely rather than removed or described as passing. Do not mark a stage complete while a required acceptance test is skipped or failing.

## Required Codex deliverables

At the end of each stage, provide:

1. The implementation and focused regression tests, with no unrequested Git or publishing operations.
2. A dependency ownership/edge report and measured before/after consumer results, separating runtime from tooling and optional inspector costs.
3. A short summary of intentional API/import/config changes and updated examples/documentation.
4. Exact verification commands and results, including environmental limits and outstanding failures.

Use two stage-level evidence files, for example `docs/evidence/lean-install/stage-1.md` and `docs/evidence/standalone-inspector/stage-2.md`, following repository conventions. Do not create an unnecessary additional planning or compatibility framework.

**Final definition of done:** a developer creates and runs a normal Relkit backend without unselected SDK stacks or inspector UI/storage. Selecting a capability gives accurate installation requirements before it is used. Inspector configuration enables only the application bridge; the inspector is explicitly installed/run locally or started through Docker, and its failure cannot take down the backend.

## Risks / Trade-offs

- Optional-peer behavior differs by supported package manager → pin/test actual Bun normal/isolated, npm and pnpm versions; never infer absence from manifests alone.
- Native modules and worker assets can disappear from copied production/tool artifacts → external packed, relocated and production-only execution proves complete closure on supported platforms.
- Splitting a shared internal route prefix can break supervision or jobs authorization → classify purpose first and test disabled-inspection readiness/client/jobs/RPC through the real HTTP boundary.
- Tool absence and bounded replay lose diagnostics → explicit loss/gap/incomplete states, independent counters, durable acknowledgement after commit, bounded retries; business work remains independent.
- Stable session routing can accidentally target the wrong generation → authenticated identity/capability handshake, candidate-validated atomic switching and stale-control rejection.
- Docker host access needs broader bridge binding → explicit target/credential/network restrictions and narrow read-only directory mounts; browser UI remains host-loopback by default.
- Existing specifications describe segment repair while the current local store uses DuckDB → replace the local-storage requirement with non-destructive, versioned store repair, retaining valid history and never fabricating deletion-based recovery.
- Large dependency moves can invalidate creation/release evidence → regenerate from exact candidate bytes and preserve failed history; functional release readiness remains separate from performance certification.

## Migration Plan

1. Inventory and baseline without changing behavior; publish both stage policies as failing/passing evidence appropriate to their current state.
2. Implement S1.2–S1.9 by owning boundary, preserving tests/data and updating producers; close S1.10 before any Stage 2 implementation.
3. Introduce independent bridge/tool configuration, rename private UI before publishable tool registration, then move session/history ownership. Update current repository consumers directly; no dependency-restoring compatibility re-exports or legacy migration command.
4. Verify Docker, docs and distribution, remove every temporary exception, and close S2.8 with actual required native/browser/container evidence.
5. Deployment/publication remains separately authorized. Failure rolls back only owned implementation/artifact changes through normal reviewed work; never delete user state/history to recover. An old tool cannot silently open an incompatible store/protocol. Preserve current database bytes and report compatibility errors safely.

## Planning review and completion

Superpowers writing-plans self-review checks requirement coverage, actionable ownership/interfaces, consistent commands, explicit failure cases and proportional detail. `tasks.md` maps every original section to deltas/design and focused evidence. Implementation boxes remain unchecked. Strict OpenSpec validation and whitespace checks establish planning integrity only, not runtime correctness. Resource-intensive implementation checks require CPU/load/memory-pressure inspection, one constrained heavy task at a time, supported worker limits and verified cleanup of processes started for verification.
