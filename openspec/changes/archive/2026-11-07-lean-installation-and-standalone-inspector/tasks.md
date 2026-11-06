# OpenSpec: Lean Installation and Standalone Inspector

> Stage 1 is accepted: 39/39 tasks. Stage 2 is accepted: 29/29 tasks. The complete current `prepush` and uninterrupted `prepush:full` commands, external installation/boundary matrix, native/browser/container acceptance and owned-resource cleanup pass. Retained evidence is in `docs/evidence/lean-install/stage-1.md` and `docs/evidence/standalone-inspector/stage-2.md`. Execution uses `openspec-apply-change`, `use-effect` and its required references, together with the applicable Superpowers execution workflow. Hosted CI, cloud acceptance and publication remain separate from this local acceptance.

**Goal:** A normal RELKIT backend installs and runs without unselected SDK stacks or inspector UI/storage, while selected capabilities and independently enabled inspection preserve behavior.

**Architecture:** Existing metadata drives selected dependency validation. Runtime lifecycle moves below development tooling. A session-owned bridge exposes authenticated live behavior; the separate inspector owns UI, collector and history.

**Tech stack:** Existing Bun/TypeScript/Effect, Hono and essential oRPC; selected native integrations; existing Next inspector and DuckDB local history.

**Spec:** Read `proposal.md`, all thirteen delta files under `specs/`, and `design.md`, including every S1/S2 section before execution.

## Global constraints and task contract

- This planning change writes no implementation/manifests/lockfiles/examples/main specs/generated references/releases. No commit/push/publish/cloud/destructive steps are included.
- Every implementation task inherits the full shared/design contract: mandatory use-effect guidance and per-file review; version-matched read-only Effect source/tests/examples; precise E/R and live/test Layers; typed failures/defects/interruption; bounded concurrency/retries; scoped acquisition/joined cleanup and configured instrumentation. Appropriate plain authoring/pure/UI boundaries remain unchanged.
- Follow root/nearest AGENTS and export/boundary guidance. The repository's 250-line limit is an upper bound; the applicable skill/spec requires formatted authored files at most 200 physical lines and functions below 50 code lines.
- Preserve dirty work, data, applied migrations, diagnostic history, durable identities/versions, Drizzle patch bytes/pins and explicitly selected frontend behavior. No new workflow abstraction, unsolicited frontend/database/auth or generic entity dispatcher.
- Before heavy commands inspect CPU capacity/load, available memory and pressure; run one heavy operation at a time with supported worker limits. If a listed orchestration script cannot enforce safe limits, constrain its underlying supported command or report the exact blocked gate. Never run broad suites merely to validate this planning change.
- Track and clean every process launched for verification, including children/servers/containers. Do not stop unrelated processes. Tests need unique temporary roots and dynamic ports; retain failed evidence safely.
- The **owner, prerequisites, exact files, interfaces, regression inputs/outcomes, command set and evidence** in each group are part of **every checkbox in that group**. Each checkbox additionally names its own deliverable and verification. Group completion requires its focused checks, relevant docs and use-effect review, not only a later integration gate.
- Paths marked proposed do not exist yet; create them only during authorized implementation, or reuse an existing equivalent owner and record the exact mapping. Commands for proposed tests/scripts are future contracts, not claims that they ran.
- C1/C2/C3 labels are local to their task group. Commands run from repository root unless an explicit cwd is shown. Use installed tools; do not introduce implicit package downloads.
- Keep original S1/S2 identifiers. S2.4's protocol/discovery contract precedes session integration in S2.3; the numerical labels preserve brief traceability rather than overriding prerequisites. S1.7's final production proof follows S1.8 storage extraction. Stage 2 cannot begin before S1.10 closes.

## Review focus

| ID  | Failure input and expected outcome                                                                                                                                                    | Owning task groups          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| R1  | Selected SDK disappears after preparation, while an unused capability has a missing peer: reject stale selected requirements before readiness; ignore unused capability requirements. | S1.2–S1.4, S1.7, S1.10      |
| R2  | Inspection disabled or production override attempted: health/activation/client identity/jobs/realtime/RPC work; no production rich inspection.                                        | S1.5, S2.1, S2.3–S2.4, S2.8 |
| R3  | Commit succeeds but acknowledgement is lost, then the same span changes revision: deduplicate replayed envelope and preserve later update.                                            | S2.5, S2.8                  |
| R4  | Bridge restarts or two sessions exist under Docker discovery: rotate safely, reject stale identity, demand explicit selection and preserve foreign descriptors.                       | S2.3–S2.6, S2.8             |
| R5  | Relocated production-only artifact uses selected native modules/workers: ready behavior and shutdown without workspace/CLI fallback.                                                  | S1.7, S1.10, S2.8           |

## 1. S1.1 — Dependency ownership and reproducible baselines

**Prerequisites:** None; confirm checkout and preserve dirty files.

**Owner:** Release/packaging and consumer verification.

**Owning files/modules:** `scripts/build-catalog.ts`, `scripts/catalog-manifest.ts`, `scripts/release-stage.ts`, `scripts/packed-scaffold-create.ts`, `scripts/scaffold-smoke-workflows.ts`, `scripts/tests/packed-manifest.test.ts`, all consumer manifests under `packages/`, `integrations/`, `apps/` and `templates/default/v1/`.

**Interfaces consumed and produced:** Consumes packed manifests, template identities and controlled registry fixtures. Produces dependency-ownership rows (package/version, consumer, capability, role, public types, transitive paths, final owner), separate stage policies and reproducible measurement records.

**Focused regression cases:** Proposed `scripts/tests/consumer-dependencies.test.ts`: `shared_instance_counted_once`, `bundled_sdk_still_counted`, `creator_before_application_install`, `stage1_exception_requires_exact_path`, `final_forbidden_family_fails`. Inputs include duplicated logical edges to one physical instance and an SDK bundled into CLI; assertions retain real installation/artifact cost.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism scripts/tests/consumer-dependencies.test.ts`. C2: proposed `bun run scripts/benchmark-consumer-install.ts --stage baseline`. Success: all accounting tests pass; baseline records every fixture/condition and records current final-policy failures without treating them as a passing final gate.

**Required evidence and gate contribution:** `docs/evidence/lean-install/baseline.json` and `docs/evidence/lean-install/stage-1.md`: raw observations, environment/cache/PM versions, matrix, exact allowed CLI inspector paths and final forbidden families. Establishes the comparison baseline, not Stage 1 closure.

- [x] 1.1 [S1.1] Inventory every manifest, entrypoint, starter and authoritative producer; classify root tooling/docs separately. Verify the delivered ownership matrix resolves every direct third-party edge and names public declaration exposure.
- [x] 1.2 [S1.1] Add the accounting/policy regressions and implement proposed `scripts/check-consumer-dependencies.ts`, `scripts/benchmark-consumer-install.ts` and `scripts/consumer-dependency-policy.ts` by reusing packed readers/registry infrastructure; run C1 and retain expected baseline final-policy failures.
- [x] 1.3 [S1.1] Measure creator-only, minimal/API development, production-only, server generic-client and agent/individual integration fixtures with C2; record versions, physical instances, compressed/unpacked bytes, native artifacts and cold/warm conditions without discarding noisy/failed samples.
- [x] 1.4 [S1.1] Document measurement reproduction and exact path exceptions in stage evidence; verify another identical fixture run reproduces dependency ownership and comparable size accounting without counting workspace lock entries as installed packages.

## 2. S1.2 — Dependency policy and requirement metadata

**Prerequisites:** S1.1 inventory and baseline.

**Owner:** Contracts/provider metadata and release catalogs.

**Owning files/modules:** `packages/contracts/src/runtime-integration.types.ts`, `packages/contracts/src/runtime-integration.ts`, `packages/compiler/src/integration-package-resolution.types.ts`, `packages/create-relkit/src/scaffold-catalog.ts`, `scripts/build-catalog.ts`, `scripts/catalog-manifest.ts`, `scripts/sync-release.ts`, `scripts/release-stage.ts`, `scripts/package-create-relkit-templates.ts`, selected integration manifests.

**Interfaces consumed and produced:** Consumes existing integration IDs/capability/adapter/protocol/export provenance. Produces IntegrationDependencyRequirement exactly as design S1.2 (package, supportedRange, installSection, capabilities, phases), selected requirement metadata and generated peer/guidance assertions; no second registry.

**Focused regression cases:** Proposed `packages/contracts/tests/integration-dependencies.test.ts`: `optional_peer_roundtrip`, `prerelease_range_boundary`, `unused_capability_peer_absent`, `duplicate_registration_rejected`; extend `tests/unit/catalog-manifest.test.ts` and `tests/unit/sync-release.test.ts` for repeated regeneration and exact Drizzle patch retention.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/contracts/tests/integration-dependencies.test.ts`. C2: `bun test tests/unit/catalog-manifest.test.ts tests/unit/sync-release.test.ts`. C3: `bun run release:sync` followed by `bun run scripts/package-create-relkit-templates.ts` during implementation only. Success: valid concrete packed ranges, stable regeneration and preserved optional metadata/repair.

**Required evidence and gate contribution:** Stage-1 requirement catalog, packed peer declarations, tested package-manager/version optional-peer behavior and source-to-generated provenance. Supplies selected-requirement contract for S1.3–S1.9.

- [x] 2.1 [S1.2] Add metadata schema/serialization and capability-phase validation with retained IDs/order/duplicate checks; run C1 including a Redis cache selection whose unselected agent-state peer is missing.
- [x] 2.2 [S1.2] Apply normal dependency versus optional peer versus dev/platform-binary policy to owning manifests and catalog entries, preserving tested prerelease ranges and Effect alignment; verify packed manifests reject wildcard/unresolved catalog versions.
- [x] 2.3 [S1.2] Update catalog, release staging and template producers together, run C2/C3 and repeat synchronization to prove idempotence and retained peer metadata/Drizzle repair.
- [x] 2.4 [S1.2] Record actual pinned Bun/npm/pnpm peer installation behavior through S1.1 fixtures and update selected integration install guidance; verify requirements are provided by the consumer rather than hoisting.

## 3. S1.3 — Selected-feature dependency preflight

**Prerequisites:** S1.2 metadata; use S1.1 isolated fixtures.

**Owner:** Compiler discovery, CLI checks and engine startup.

**Owning files/modules:** `packages/compiler/src/integration-package-resolution.ts`, `packages/compiler/src/integration-package-source.ts`, `packages/compiler/src/runtime-integration-plan.ts`, `packages/compiler/src/runtime-integration-imports.ts`, `packages/engine/src/runtime-integrations.ts`, `packages/engine/src/provider-registry-validation.ts`, `packages/cli/src/commands/deployment-integrations.ts`, `packages/cli/src/commands/doctor-project.service.ts`.

**Interfaces consumed and produced:** Consumes explicit imports/descriptors and selected requirement metadata. Produces deterministic phase requirement plans and typed missing/version/protocol/initialization diagnostics with capability/source/range/installed version/install command; shared resolver stays below CLI.

**Focused regression cases:** Proposed `packages/compiler/tests/selected-dependencies.test.ts` and `packages/engine/tests/selected-dependencies.test.ts`: `missing_config_import_before_evaluation`, `nested_missing_dependency_preserves_cause`, `hidden_package_json_exports`, `adapter_relative_peer_resolution`, `runner_cache_not_project`, `selected_sdk_removed_after_prepare`, `unused_redis_agent_peer`, `deploy_peer_not_runtime`; assert zero network/package/lockfile mutation.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/compiler/tests/selected-dependencies.test.ts packages/engine/tests/selected-dependencies.test.ts`. C2: `bun test tests/compiler/runtime-integration-plan.test.ts`. Success: correct diagnostics before readiness in consumer/workspace/isolated contexts and deterministic plans.

**Required evidence and gate contribution:** Stage-1 diagnostic JSON plus original nested causes, consumer resolution roots, unchanged manifest/lock hashes and no-network assertions. Covers review class R1.

- [x] 3.1 [S1.3] Extend existing static import/declaration analysis to collect safely known selected requirements before avoidable config evaluation; run C1's missing-import and phase-selection cases without a new parser.
- [x] 3.2 [S1.3] Implement consumer/adapter-context resolution with exports-aware version checks and typed failure distinctions; run C1 for isolated layouts, hidden package.json, nested initialization failures and multi-capability selection.
- [x] 3.3 [S1.3] Wire check/build/dev/deploy and runtime startup validation before readiness; run C1/C2 with a selected SDK removed after preparation and retain the prior valid generation.
- [x] 3.4 [S1.3] Document machine/human diagnostics and package-manager-specific correction commands, verify no silent installation and no npx-implies-npm inference using C1 and consumer fixtures.

## 4. S1.4 — Agent declarations and SDK execution

**Prerequisites:** S1.2–S1.3; S1.1 inventory.

**Owner:** Agent contracts and explicit LangChain integration.

**Owning files/modules:** `packages/agents/src/index.ts`, `packages/agents/src/runtime-native-support.ts`, `packages/app/src/index.ts`, `packages/app/src/internal-runtime.ts`, `packages/contracts/src/agent-state.ts`, `packages/engine/src/runtime-integrations.ts`, `packages/providers-local/`, `integrations/packages/redis/`; proposed `integrations/packages/langchain/`.

**Interfaces consumed and produced:** Consumes generic descriptors/events/state and selected runtime requirement plan. Produces SDK-free generic declarations plus explicit native execution, model/tool conversion, middleware/checkpoint/SDK-telemetry and conditional DeepAgents exports. Preserve native APIs without redundant flags.

**Focused regression cases:** Proposed `integrations/packages/langchain/tests/selection.test.ts`: `ordinary_agent_without_deepagents`, `missing_selected_engine_before_ready`, `nested_sdk_failure`, `stream_tool_persist_resume_cancel`; S1.1 fixtures `root_rest_rpc_no_agent_stack`, `redis_cache_no_agent_state`, `local_bucket_jobs_no_agent_engine` assert install/evaluation/declaration isolation.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism integrations/packages/langchain/tests/selection.test.ts`. C2: `bun run test:contracts` and `bun run test:integration` sequentially after focused checks. Success: native selected behavior and shared state semantics pass, non-agent paths contain no LangChain/LangGraph/LangSmith/DeepAgents.

**Required evidence and gate contribution:** Stage-1 API/import migration table, selected execution tests, state/durable version comparison and four-boundary scans. Covers R1 without introducing workflows.

- [x] 4.1 [S1.4] Move only SDK-backed execution and intrinsically native public APIs to the explicit integration, keep generic declarations lightweight and update compiler mapping; verify root/client declaration and import scans in S1.1.
- [x] 4.2 [S1.4] Move native graph/model/tool/middleware/checkpoint/telemetry code together and make DeepAgents requirements selection-specific; run C1 with missing selected and missing unused peers.
- [x] 4.3 [S1.4] Relocate shared agent-state contracts below implementations and register only selected Redis/local capabilities; verify cache/realtime/bucket/jobs fixtures do not evaluate agent engines.
- [x] 4.4 [S1.4] Update explicit agent starter/examples/testing imports and public docs, preserving streaming, state identity, interruption/resume, durable versions, retries and cancellation; run C1/C2 and record retained native evidence.

## 5. S1.5 — HTTP transports and documentation UI

**Prerequisites:** S1.2–S1.4; endpoint inventory before moving routes.

**Owner:** HTTP runtime and core endpoint wiring.

**Owning files/modules:** `packages/runtime-hono/src/index.ts`, `packages/runtime-hono/src/create-app.ts`, `packages/runtime-hono/src/create-rest-app.ts`, `packages/runtime-hono/src/prepared-app.ts`, `packages/runtime-hono/src/prepared-transports.service.ts`, `packages/cli/src/commands/build-server-http.ts`, `packages/cli/src/commands/build-server-http-options.ts`, `packages/inspector-api/src/router.ts`.

**Interfaces consumed and produced:** Consumes selected phase requirements and verified generation inputs. Produces independently initialized MCP/AG-UI/Scalar entrypoints, OpenAPI-without-Scalar, and documented classification of core readiness/client/jobs/realtime/RPC versus rich inspector/history routes.

**Focused regression cases:** Extend `packages/runtime-hono/tests/prepared-app.test.ts`, `api-docs.test.ts`, `api-docs-auth.test.ts`; proposed `packages/runtime-hono/tests/optional-transports.test.ts`: `rpc_without_optional_sdks`, `disabled_inspector_core_endpoints`, `production_override_no_rich_api`, `single_flight_context_isolation`, `cancel_then_retire_join`, `selected_sdk_init_failure`, `request_logged_once`.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/runtime-hono/tests/optional-transports.test.ts packages/runtime-hono/tests/prepared-app.test.ts packages/runtime-hono/tests/api-docs.test.ts packages/runtime-hono/tests/api-docs-auth.test.ts`. Success: real HTTP assertions preserve authorization/origin/body/rate/middleware behavior and all selected initialization is validated before readiness.

**Required evidence and gate contribution:** Stage-1 route-purpose table with endpoint/auth owner and generation lifecycle traces. Covers R2; no prefix-wide move of /_relkit/v1.

- [x] 5.1 [S1.5] Classify each shared-prefix route and add real HTTP regressions for inspection-disabled health/activation proof/client identity/jobs/realtime/RPC; verify C1 rejects accidental gating and preserves operation IDs.
- [x] 5.2 [S1.5] Replace whole-app deferred loading with selected-capability, generation-owned single-flight initialization while retaining contexts/cancellation/joined disposal; verify concurrent and retiring-generation C1 cases.
- [x] 5.3 [S1.5] Isolate optional MCP/AG-UI/Scalar peers and entrypoints, retain OpenAPI without Scalar and validate explicit docs selection before readiness; verify C1 absence/version/initialization cases.
- [x] 5.4 [S1.5] Update runtime/API-docs guidance and generated endpoint producers; run C1 for middleware order, security, production overrides and exactly-once logs, recording the unchanged core contract.

## 6. S1.6 — Client, auth/database and testing isolation

**Prerequisites:** S1.2 policy; S1.4 native helper ownership.

**Owner:** Client, Better Auth, Drizzle and testing packages.

**Owning files/modules:** `packages/client/package.json`, `packages/client/src/index.ts` and existing root/server/React/TanStack entrypoints; `packages/better-auth/`, `packages/drizzle/`, `packages/testing/`; `tests/types/` and packed consumer fixtures from S1.1.

**Interfaces consumed and produced:** Consumes canonical DefaultContractRegistry/generated declarations and selected requirement metadata. Produces independent root/server client and general test harness, optional frontend bindings, selected native DB drivers and separate Drizzle-specific auth bridging.

**Focused regression cases:** Proposed `scripts/tests/consumer-type-isolation.test.ts`: `server_registry_inference_no_frontend`, `backend_auth_without_react`, `minimal_harness_no_provider_sdks`, `selected_frontend_only_documented_peers`, `single_database_driver`, `agent_helpers_explicit`; each invokes actual packed TypeScript declarations with skipLibCheck false, positive/negative inference and no stubs/any/suppression.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism scripts/tests/consumer-type-isolation.test.ts`. C2: `bun run test:types` and affected owning-package suites through `bun run test:packages`. Success: strict isolated consumers pass and real selected SDK behavior remains covered.

**Required evidence and gate contribution:** Stage-1 declaration resolution graph, exact dependency lists, inferred type assertions and public entrypoint changes.

- [x] 6.1 [S1.6] Make React/TanStack and @orpc/tanstack-query optional at their actual entrypoints while preserving DefaultContractRegistry authority; run C1 server and selected-frontend cases.
- [x] 6.2 [S1.6] Apply SDK/driver selection to auth/database without hiding legitimate upstream requirements, preserving React-only and Drizzle-specific boundaries; run C1 backend-auth and native driver cases.
- [x] 6.3 [S1.6] Move specialized testing helpers behind existing feature subpaths or owning integration testing exports, retain useful starter tests; run C1 minimal and agent-helper fixtures.
- [x] 6.4 [S1.6] Update package JSDoc/install examples and emitted declaration checks via existing build producers; run C1/C2 and verify no type workaround masks a missing peer.

## 7. S1.7 — Deployment and production runtime ownership

**Prerequisites:** S1.2–S1.6; coordinate storage split with S1.8 before final production proof.

**Owner:** Engine lifecycle, CLI build and deployment integrations.

**Owning files/modules:** `packages/cli/src/server-runtime/server-runtime-host.ts` and sibling lifecycle modules/tests; `packages/cli/src/commands/deployment-integrations.ts`, `build-stage-files.ts`, `build-server-imports.ts`, `build-manifest.ts`, `build-container.ts`, `packages/cli/src/dev-snapshot/`; `packages/deploy/`, `packages/deploy-pulumi/`, `packages/cloud-aws/`, `integrations/packages/aws/`, `integrations/packages/pulumi/`; proposed `packages/engine/src/server-runtime/`.

**Interfaces consumed and produced:** Consumes selected runtime/deploy plans and current lifecycle contracts. Produces narrow engine internal runtime export, TS plus JS build entries, complete runtime module/native/worker/asset closure and dependency-aware prepared fingerprints. Canonical startup: NODE_ENV=production bun run --no-env-file .relkit/build/server/index.js.

**Focused regression cases:** Move existing `packages/cli/tests/server-runtime/` tests with ownership; proposed `packages/engine/tests/server-runtime/production-closure.test.ts`: `relocated_production_only`, `selected_native_worker_assets`, `removed_sdk_invalidates_prepare`, `late_acquisition_cancelled`, `original_failure_survives_cleanup`; retain pure deployment plan/mocks.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/engine/tests/server-runtime`. C2: `bun run test:deployment`. C3: S1.1 external production fixture launches the exact canonical command after production-only install and relocation. Success: ready native behavior and bounded clean shutdown without CLI/compiler/inspector/Pulumi fallback.

**Required evidence and gate contribution:** Stage-1 runtime export/import map, Docker allowlist/closure inventory, relocated startup outputs, readiness/shutdown evidence and offline deployment results. Covers R1/R5.

- [x] 7.1 [S1.7] Resolve deployment implementations through selected metadata and remove unconditional CLI implementation edges; run C2 and packed selected deployment fixtures without provisioning cloud resources.
- [x] 7.2 [S1.7] Move lifecycle implementation to engine-owned internal exports with unchanged cancellation/readiness/late-acquisition/shutdown/failure semantics; run C1 migrated lifecycle tests.
- [x] 7.3 [S1.7] Update build imports, starter start scripts and documentation to emitted JavaScript; make container copy/dependency closure include selected externals, native binaries, workers/assets; execute C3 with natives rather than only scanning a bundle.
- [x] 7.4 [S1.7] Extend preparation identity and runtime revalidation for selection/version/lock/config changes and missing installed SDKs; run C1/R1 and preserve last-known-good development behavior.
- [x] 7.5 [S1.7] Record production path/cwd/environment/relocation contracts and regenerate owning outputs; run C1–C3 after S1.8 so storage removal is included in closure evidence.

## 8. S1.8 — Observability and local persistence

**Prerequisites:** S1.1–S1.2; coordinates with S1.7.

**Owner:** Lightweight observability and explicit local store.

**Owning files/modules:** `packages/observability/src/local/`, `packages/observability/package.json`, `packages/observability/src/early-records-policy.ts`, `packages/observability/src/redaction.ts`, `packages/runtime-effect/`, `packages/cli/src/commands/dev-inspector-support.service.ts`, `build-server-telemetry.ts`; proposed `packages/observability-local/`.

**Interfaces consumed and produced:** Consumes existing redacted records, store/query contracts and history schema. Produces SDK-free record/logging/retention interfaces and explicit local-store implementation injected by the Stage 1 legacy CLI inspector path.

**Focused regression cases:** Proposed `packages/observability-local/tests/ownership.test.ts`: `existing_history_readable`, `driver_worker_assets_pack`, `console_without_storage`, `production_no_duckdb`, `legacy_cli_explicit_store`; retain `tests/integration/observability/collector-consumers.test.ts`.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/observability-local/tests/ownership.test.ts`. C2: `bun test tests/integration/observability/collector-consumers.test.ts` and `bun run test:inspector`. Success: existing history and console behavior work while app imports/declarations/artifacts exclude DuckDB.

**Required evidence and gate contribution:** Stage-1 store contract, exact temporary CLI acquisition edge, before/after history/schema checks and native worker packing inventory.

- [x] 8.1 [S1.8] Extract concrete driver/database/query/worker/retention ownership while keeping producers on a lightweight interface; run C1 import and declaration isolation cases.
- [x] 8.2 [S1.8] Inject the explicit local store through enumerated legacy CLI inspection ownership, keep console/production logging usable without storage; run C1/C2 with and without the store.
- [x] 8.3 [S1.8] Preserve diagnostic history/schema and keep jobs/checkpoints/provider data outside the store, update observability ownership docs and package producers; run C1 existing-history and worker-asset cases.

## 9. S1.9 — Creator, wrapper and metadata-only catalog

**Prerequisites:** S1.2–S1.8 selected requirements/entrypoints.

**Owner:** Creation and CLI scaffolding tooling.

**Owning files/modules:** `packages/create-relkit/src/source-edit.ts`, `project-catalog.ts`, `scaffold-catalog.ts`, `generate-preparation.ts`, `generate-workflow.ts`, `plan-builder-manifest.ts`; `packages/cli/src/scaffold-command.ts`, `scaffold-mutations.ts`; `packages/relkit/src/bin.ts`, `packages/relkit/src/index.ts`; `integrations/catalog/`, `templates/default/v1/`, `scripts/package-create-relkit-templates.ts`, `patches/drizzle-orm.patch` (preserve bytes).

**Interfaces consumed and produced:** Consumes S1.2 metadata, AST source edit/discovery and existing transactional generator. Produces lightweight creator and create-wrapper bootstrap, CLI-owned existing-project tools, selected starter dependencies and metadata-only catalog. Proposed separate scaffolding package only if no existing correct owner suffices.

**Focused regression cases:** Proposed `scripts/tests/creator-isolation.test.ts`: `no_install_no_fetch_or_eval`, `wrapper_create_no_cli_install`, `project_cli_version_mismatch`, `wrapper_no_recursion`, `bunx_npx_same_selection`, `missing_bun_diagnostic`, `catalog_no_executable_exports`, `drizzle_patch_only_selected`; retain scaffold rollback/collision suites and fullstack candidate behavior.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism scripts/tests/creator-isolation.test.ts`. C2: `bun run test:generator`. C3: `bun run scripts/package-create-relkit-templates.ts` followed by external packed creation through supported pinned runners. Success: no-install has no install/evaluation side effects and selected projects retain transactions/checks.

**Required evidence and gate contribution:** Stage-1 creator/wrapper footprint, installed versus no-install trace, selected manifest snapshots, exact patch hashes and direct standalone sample imports.

- [x] 9.1 [S1.9] Move compiler-backed discovery/add/AST editing to CLI-owned tooling, remove creator compiler/TypeScript/re-export reachability once no longer needed, and avoid dependency cycles; run C1 no-install case.
- [x] 9.2 [S1.9] Make wrapper creation delegate to the lightweight creator and project commands resolve the compatible local CLI without recursion/duplicate binaries; run C1 runner/version/Bun cases.
- [x] 9.3 [S1.9] Remove catalog executable re-exports and update samples to selected standalone imports; run C1 catalog and isolated integration fixtures.
- [x] 9.4 [S1.9] Render minimal/API/agent and optional feature manifests from selected requirements, retain explicit frontend behavior, .relkit ignores and feature-conditional unchanged Drizzle repair; run C2/C3 and document exact install/check/prepare next steps.

## 10. S1.10 — Stage 1 acceptance

**Prerequisites:** S1.1–S1.9 completed with per-file use-effect review; Stage 2 remains blocked.

**Owner:** Cross-package acceptance and release metadata.

**Owning files/modules:** `scripts/check-boundaries.ts`, `tests/phase0.test.ts`, `scripts/tests/consumer-dependencies.test.ts` and `consumer-type-isolation.test.ts` (from earlier tasks), `scripts/pack-and-smoke-create-relkit.ts`, `scripts/release-check.ts`, `scripts/release-package-contract.ts`, `.changeset/`, affected docs/examples/canonical skills.

**Interfaces consumed and produced:** Consumes exact candidate packs, ownership matrix, stage policies and earlier focused evidence. Produces Stage 1 gate report and enumerated remaining final-policy inspector paths; no publication or all-packages-same-version assumption.

**Focused regression cases:** Use all six baseline fixtures across Bun normal/isolated/npm/pnpm; minimal/API check/type/test/REST/RPC/build/start; generic inference and harness; missing/incompatible/unused peers; cache+realtime, jobs+auth, agents+tools; accurate initialization failure; native production workers; explicit legacy inspector. Reject registry fallback and workspace links/specifiers.

**Exact verification and success condition:** C1: sequential full implementation command matrix below with candidate build before packed certification. C2: `bun run vitest run --maxWorkers=1 --no-file-parallelism scripts/tests/consumer-dependencies.test.ts scripts/tests/consumer-type-isolation.test.ts scripts/tests/creator-isolation.test.ts`. C3: proposed `bun run scripts/check-consumer-dependencies.ts --stage 1`. Success: no functional/isolation failures except exact documented final-policy legacy inspector paths.

**Required evidence and gate contribution:** `docs/evidence/lean-install/stage-1.md`: exact commands/results/failures, before/after measurements, API changes, docs/release consistency, Effect reviews and explicit Stage 2 admission decision.

- [x] 10.1 [S1.10] Extend boundary/packing checks for core-to-SDK and core-to-storage regressions, then run C2/C3 against controlled external consumers with no workspace/registry fallback.
- [x] 10.2 [S1.10] Execute the Stage 1 functional/package-manager/mixed-capability/native matrix and required command sequence, retaining every failed or blocked result and resource limit.
- [x] 10.3 [S1.10] Reconcile affected docs/examples/skills and changesets/release classifications with tested packs, then record a Stage 1 gate only when all required functional/isolation checks pass and remaining exceptions are exact CLI inspector paths.

## 11. S2.1 — Application/tool configuration

**Prerequisites:** S1.10 gate closed.

**Owner:** App configuration and generated runtime policy.

**Owning files/modules:** `packages/app/src/app-config.types.ts`, `packages/app/src/app-validation.ts`, `packages/app/src/define-app.ts`, `packages/cli/src/commands/build-server-http.ts`, `build-server-http-inspector.ts`, `build-server-deferred-inspector.ts`, `templates/default/v1/`.

**Interfaces consumed and produced:** Consumes lightweight bridge contract and existing defineApp validation. Produces inspector.enabled plus optional connection.host/port, defaults 127.0.0.1:0; standalone UI port 3210. Omitted/false inspection is disabled; old inspector.port is an actionable validation error.

**Focused regression cases:** Proposed `packages/app/tests/inspector-selection.test.ts`: `omitted_disabled`, `installed_but_disabled`, `enabled_without_tool`, `legacy_port_rejected`, `invalid_host_port`, `production_enable_override`; assert no disabled listener/worker/db/process/discovery file and core readiness/client/jobs/RPC still work.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/app/tests/inspector-selection.test.ts packages/runtime-hono/tests/optional-transports.test.ts`. Success: all four enable/install/run/production states are distinct and production never exposes rich inspection.

**Required evidence and gate contribution:** Stage-2 configuration matrix, emitted production registration scan and real HTTP endpoint results. Covers R2.

- [x] 11.1 [S2.1] Implement bridge configuration/defaults and obsolete-port rejection, keep tool UI settings separate; run C1 configuration cases.
- [x] 11.2 [S2.1] Exclude rich inspection from production regardless of configuration/legacy environment toggles while preserving core probes and business endpoints; run C1 production and disabled cases.
- [x] 11.3 [S2.1] Update creator defaults/current manually configured samples and config guidance directly, omitting tool/config unless selected; verify regenerated template snapshots and C1 installed-but-disabled case.

## 12. S2.2 — Standalone distribution

**Prerequisites:** S1.10 and S2.1; consume S1.8 store.

**Owner:** Inspector launcher/distribution and private UI.

**Owning files/modules:** `apps/inspector/package.json`, `apps/inspector/`, `scripts/package-inspector.ts`, `packages/cli/package.json`, `scripts/build.ts`, `scripts/release-package-contract.ts`, `scripts/workspace-packages.ts`; proposed `packages/inspector/`; workspace `tsconfig.json`, `turbo.json` and release catalogs.

**Interfaces consumed and produced:** Consumes existing Next standalone output and explicit store/bridge contracts. Produces publishable @relkit/inspector with relkit-inspector launcher and private @relkit/inspector-ui; launcher owns UI/collector/store process tree and launch-time project/connection/credential/target/history choices.

**Focused regression cases:** Proposed `packages/inspector/tests/distribution.test.ts`: `unique_workspace_names`, `packed_outside_checkout`, `all_traced_assets`, `native_worker_license_metadata`, `cli_has_no_inspector_assets`, `runner_cache_not_history`, `uninstall_tool_backend_works`, `browser_cannot_override_launch_inputs`.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/inspector/tests/distribution.test.ts`. C2: `bun run scripts/package-inspector.ts` after required UI build, then external packed launch. Success: declared runtimes/assets resolve without checkout and CLI tarball/install contains no UI/store even as optional dependencies.

**Required evidence and gate contribution:** Stage-2 tarball inventories/checksums, required tool runtimes/native platforms/licenses, process ownership and tested package-runner syntax; publication remains not performed.

- [x] 12.1 [S2.2] Rename private UI workspace before registering the publishable tool, update selectors/build/release references and verify unique names through C1.
- [x] 12.2 [S2.2] Move packaging output out of CLI, include traced UI/native assets and store/launcher ownership; run C1/C2 and inspect actual tarballs.
- [x] 12.3 [S2.2] Implement explicit launcher options and scoped process tree, document canonical separate dev/inspector scripts and tested runner behavior; run external packed execution and C1 uninstall/cache/launch-choice cases.

## 13. S2.3 — Development and session ownership

**Prerequisites:** S2.1; coordinate S2.4 protocol before session tests; tool integration uses S2.2.

**Owner:** CLI development session and lightweight bridge lifecycle.

**Owning files/modules:** `packages/cli/src/commands/dev-session-owner.ts`, `dev-session.ts`, `dev-session-engine.ts`, `dev-engine-activation.ts`, `dev-engine-stop.ts`, `dev-inspector.ts`, `dev-inspector-installation.ts`, `dev-inspector-support.service.ts`, `dev-process.ts`, `doctor-checks.ts`; `packages/cli/src/dev-snapshot/`.

**Interfaces consumed and produced:** Consumes validated candidates and session bridge contract from S2.4. Produces stable session listener/credential/discovery identity with atomic active-generation reference, bounded degraded inspection status, and UI-independent dev/doctor/history command ownership.

**Focused regression cases:** Proposed `packages/cli/tests/services/standalone-inspector-session.test.ts`: `reload_keeps_session`, `rejected_candidate_keeps_target`, `old_generation_cannot_delete_descriptor`, `full_restart_rotates_credentials`, `bridge_bind_failure_backend_ready`, `tool_lifetimes_independent`, `no_ui_lookup_download`, `prepared_artifact_no_secret`; extend existing dev-snapshot/lifecycle suites.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/cli/tests/services/standalone-inspector-session.test.ts`. C2: `bun run test:certification`. Success: no duplicate listeners/orphans, correct candidate activation and independent app/tool lifetimes.

**Required evidence and gate contribution:** Stage-2 session/generation IDs, activation/drain traces, process cleanup counts and prepared-secret scans. Covers R2/R4.

- [x] 13.1 [S2.3] Remove UI lookup/spawn/probe/poll/reinstall errors and UI shutdown ownership from dev, keep normal local-service/reload/logging behavior; run C1 no-tool and lifetime cases.
- [x] 13.2 [S2.3] Acquire the bridge once per session, switch only on validated candidates and retain old-generation attribution; run C1 valid/rejected/repeated reload and ownership cases.
- [x] 13.3 [S2.3] Separate invalid configuration from bind/runtime bridge failure, bound recovery and retain backend readiness; run C1 failure/restart/prepared-secret cases.
- [x] 13.4 [S2.3] Update doctor and classify historical CLI versus live jobs/provider operations; preserve auth/operation IDs, add no new inspector alias and document optional local delegation only where already present; run C1/C2.

## 14. S2.4 — Bridge protocol and private discovery

**Prerequisites:** S2.1; uses S1.5 endpoint classification and S1.8 record contracts; provides interface to S2.3.

**Owner:** Inspector API live bridge and tool connection client.

**Owning files/modules:** `packages/inspector-api/src/router.ts`, `runtime-projection.ts`, `actions-runtime.ts`, `actions.schemas.ts`, `events-runtime.ts`, `inspector-endpoint-paths.ts`; existing contracts under `packages/contracts/`; proposed `packages/inspector-api/src/connection/` and `packages/inspector/src/connection/`.

**Interfaces consumed and produced:** Consumes live generation/provider projections and redacted record stream. Produces versioned handshake (protocol/project/session/capabilities), per-session descriptors under .relkit/connections/, authenticated live actions and selected-connection client. Descriptor fields: protocol, project/session IDs, endpoint, process metadata, createdAt and session authentication material only.

**Focused regression cases:** Proposed `packages/inspector-api/tests/connection.test.ts`: `wrong_missing_token`, `foreign_origin_host`, `malformed_oversized_body`, `cross_project`, `pid_reuse_not_identity`, `two_sessions_require_selection`, `stale_incompatible_session`, `symlink_escape`, `foreign_descriptor_cleanup`, `stale_control_lost_response`, `agentless_no_sdk`.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/inspector-api/tests/connection.test.ts`. C2: `bun run test:security` and `bun run test:inspector`. Success: authentic compatible sessions connect, every adversarial case fails before disclosure/mutation and no foreign file is changed.

**Required evidence and gate contribution:** Stage-2 protocol/schema/version tables, permission/atomic-file assertions, no-secret scans and mutation receipt cases. Covers R2/R4.

- [x] 14.1 [S2.4] Separate live projections/actions/collection from tool history, keep core business endpoints in place and bridge free of compiler/UI/store/SDK implementations; run C1 agentless and dependency scans.
- [x] 14.2 [S2.4] Implement private session descriptor publication with owner permissions, atomic replacement, containment/symlink checks and owner-only cleanup; run C1 collision/foreign/symlink/PID cases.
- [x] 14.3 [S2.4] Implement 0/1/multiple-session discovery with bounded retry, authenticated identity negotiation and explicit connection-file selection, no config execution; run C1 stale/cross-project/ambiguity cases.
- [x] 14.4 [S2.4] Authenticate/constrain every operation, preserve server-only credentials and existing authorization/idempotency, reject stale controls and blind retries after lost responses; run C1/C2 and update protocol/security guidance.

## 15. S2.5 — History, replay and bounded collection

**Prerequisites:** S1.8, S2.2–S2.4.

**Owner:** Inspector collector/local store and lightweight application records.

**Owning files/modules:** Stage-1 `packages/observability-local/` store/worker implementation; `packages/observability/src/early-records-policy.ts`, `early-records-state.ts`, `redaction-core.ts`; `packages/inspector-api/src/events-runtime.ts`; proposed `packages/inspector/src/collector/`; existing `apps/inspector/` history/live views.

**Interfaces consumed and produced:** Consumes schema-validated redacted envelopes with session ID, monotonic sequence and generation attribution. Produces durable acknowledgement only after atomic record+replay-identity commit, bounded replay/gap/loss status and tool-owned history queries with independent storage version/project identity.

**Focused regression cases:** Proposed `packages/inspector/tests/collection.test.ts`: `commit_then_lost_ack_deduplicates`, `same_span_new_revision_persists`, `disconnect_before_commit_replays`, `retention_gap_explicit`, `old_generation_records_attributed`, `json_redaction_brand_not_trusted`, `every_count_byte_bound`, `slow_subscriber_dropped`, `disk_full_worker_crash_original_outcome`, `single_writer_preserved_history`, `foreign_history_volume_rejected`.

**Exact verification and success condition:** C1: `bun run vitest run --maxWorkers=1 --no-file-parallelism packages/inspector/tests/collection.test.ts`. C2: `bun run test:inspector` and `bun run test:inspector:browser` with required browser prerequisites. Success: fault-injected commit/replay/revision invariants, numeric bounds, existing history and real selected-feature workflows pass.

**Required evidence and gate contribution:** Stage-2 original/history checksums and readback, durable cursors versus commit receipts, per-boundary queue high-water marks/loss counters, fault outcomes, browser assertions and five-second flush cleanup. Covers R3.

- [x] 15.1 [S2.5] Make the standalone tool the sole DuckDB writer/query/retention/worker owner; preserve history/schema, detect writer locks and project-volume mismatches without deletion; run C1 history/conflict cases.
- [x] 15.2 [S2.5] Implement session/sequence durable replay identity with generation attribution and atomic data+identity commit before ack; run C1 lost-ack, disconnect, repeated-revision and old-generation cases.
- [x] 15.3 [S2.5] Enforce all design S2.5 limits: early 2048/2097152 (ceilings 65536/67108864), individual 1 MiB, batch 256/1 MiB, pending 2048/4 MiB, 100 ms flush, subscriber default64/max256/1 MiB, aggregate4 MiB and five-second flush; run C1 exact-bound/one-over cases with independent counters.
- [x] 15.4 [S2.5] Validate decoded redacted records, disconnect slow subscribers, bound failures/retries and preserve primary outcomes/durable jobs/checkpoints; run C1 privacy/worker/disk/permission/corruption cases.
- [x] 15.5 [S2.5] Update views and guidance for buffered/incomplete/gap/unavailable states, preserve real graph/log/trace/job/agent actions; run C2 browser workflows beyond homepage loading.

## 16. S2.6 — Docker distribution

**Prerequisites:** S2.2–S2.5 local standalone contract verified.

**Owner:** Inspector packaging/container and existing CI release integration.

**Owning files/modules:** Proposed `packages/inspector/Dockerfile` and owning Docker guide; `scripts/package-inspector.ts`, existing workflows under `.github/workflows/`, `scripts/release-check.ts`, `tests/container/`; use narrow connection directory and explicit history volume.

**Interfaces consumed and produced:** Consumes packed standalone tool, connection/credential directory and project-bound history. Produces local build/versioned image contract, non-root signal-safe process tree and listening/disconnected/connected-ready health states; no publication in this task.

**Focused regression cases:** Proposed `tests/container/standalone-inspector.test.ts`: `desktop_host_connection`, `linux_host_gateway_connection`, `private_network_connection`, `directory_mount_sees_rotation`, `two_sessions_explicit_choice`, `history_survives_recreate`, `signals_reap_children`, `restricted_mounts_nonroot`, `foreign_history_denied`.

**Exact verification and success condition:** C1: proposed `docker build -f packages/inspector/Dockerfile -t relkit-inspector:local .` after constrained resource preflight. C2: `bun test tests/container/standalone-inspector.test.ts`. Success: real container evidence on the applicable Desktop/Linux environments; unsupported/unavailable environments remain explicitly incomplete, not simulated passes.

**Required evidence and gate contribution:** Stage-2 image digest, platforms/native assets, mount/network/UID inspection, credential rotation and persistence assertions, health/signal results and executed host/private-network examples. Covers R4.

- [x] 16.1 [S2.6] Add dedicated image build/release classification using existing infrastructure, package required runtime/native assets, non-root execution, signals and distinct health states; run C1 and image assertions in C2.
- [x] 16.2 [S2.6] Use read-only directory/secret mounts plus explicit history volume, default host-loopback UI publishing and no source/dependencies/env/Docker socket mounts; run C2 mount/history/recreation tests.
- [x] 16.3 [S2.6] Document and execute Desktop, Linux host-gateway and private-network binding/target/file-credential examples, preserving handshake identity during target override and atomic rotation; run C2 rotation/ambiguity/network cases without publishing.

## 17. S2.7 — Documentation, templates, skills and releases

**Prerequisites:** S2.1–S2.6; earlier tasks already land their own docs/tests.

**Owner:** Documentation, generators and release registration.

**Owning files/modules:** `AGENTS.md`, `README.md`, `apps/docs/content/docs/operations/inspector.mdx`, `apps/docs/content/docs/start/build-and-run.mdx`, `apps/docs/scripts/generate.ts`, CLI command/JSDoc sources, `templates/default/v1/`, `examples/commerce/`, `.agents/skills/relkit-app/`, `.agents/skills/documentation-writer/`, `.agents/skills/relkit-deploy/`, `scripts/build-catalog.ts`, `scripts/sync-release.ts`, `scripts/release-package-contract.ts`, `tsconfig.json`, `turbo.json`, `.changeset/`.

**Interfaces consumed and produced:** Consumes final implemented config/CLI/exports/requirement catalog and package identity. Produces synchronized source guidance, generated API/CLI/search references, packed template skills/examples and complete workspace/release classifications; global/third-party skills are out of scope.

**Focused regression cases:** Existing docs/example/generator checks plus explicit `lean_backend_guide`, `enabled_install_run_guide`, `docker_restart_guide`, `selected_dependency_install_ranges`, `packed_skill_links`, `new_package_registration_complete`; compare guides to actual packed outputs and executed commands, not keyword-only scans.

**Exact verification and success condition:** C1: `bun run --cwd apps/docs generate` then `bun run --cwd apps/docs generate:check`. C2: `bun run scripts/package-create-relkit-templates.ts`, `bun run test:docs`, `bun run test:examples`, `bun run test:generator` sequentially. C3: `bun run check` and `bun run konsistent -- validate`. Success: generated output fresh, linked examples work and no omitted registration/normal bundled-inspector promise remains.

**Required evidence and gate contribution:** Stage-2 source-to-derived inventory, canonical/distributed skill parity, executable guide results, intentional import/config changes, changesets and package classification; preserve independent versions.

- [x] 17.1 [S2.7] Reconcile source documentation/config/help/JSDoc with actual installs, supported ranges, bridge/UI addresses, tool prerequisites, session selection, capture limits, history and production exclusion; run C1 and guide scenarios.
- [x] 17.2 [S2.7] Update templates/examples/canonical skills and distributed copies via their producers, retain lean and explicitly inspected examples plus selected frontend/data/migrations/repair; run C2 and packed instruction flows.
- [x] 17.3 [S2.7] Register every new/renamed package in TypeScript/Turbo/structural/export/API/packing/changeset/release machinery without exemptions; run C3 and release contract tests, record publication as separately authorized.

## 18. S2.8 — Final gate

**Prerequisites:** S2.1–S2.7 completed and reviewed; S1 evidence retained.

**Owner:** Cross-package final acceptance.

**Owning files/modules:** Stage policies/measurement scripts from S1.1, candidate packaging/release checks, all focused tests above, `docs/evidence/lean-install/stage-1.md`, proposed `docs/evidence/standalone-inspector/stage-2.md`.

**Interfaces consumed and produced:** Consumes exact candidate packs and both stage evidence sets. Produces final four-boundary isolation result, comparable creator/development/production/inspector measurements, measured numeric budgets and explicit local/CI/publication/registry evidence status.

**Focused regression cases:** Every final matrix row in design S2.8: minimal/API forbidden families, default dev and business endpoints, installed-disabled, bridge-only, standalone actions/lifetimes, security/protocol, durable collection/revisions/failures, Docker rotation/persistence, relocated native production and complete packaged delivery.

**Exact verification and success condition:** C1: proposed `bun run scripts/check-consumer-dependencies.ts --stage final` and `bun run scripts/benchmark-consumer-install.ts --stage final`. C2: full implementation matrix below, plus `bun run test:inspector:browser`, `bun run test:container`, `bun run test:scaffold`, `bun run prepush:full` with available prerequisites and one heavy operation at a time. Success: zero exceptions, actual required native/browser/container passes and complete cleanup.

**Required evidence and gate contribution:** Stage-2 final comparison and commands/results, failed/noisy observations, measured size/count budgets, exact tested hashes/platforms, Effect per-file reviews and remaining external release evidence. No claim of hosted CI/publication/registry proof from local commands.

- [x] 18.1 [S2.8] Remove every temporary inspector path exemption and run C1 across all matching external fixtures; reject forbidden dependencies regardless of total size improvements.
- [x] 18.2 [S2.8] Execute the final scenario matrix and R1–R5 through owning boundary tests, including actual browser/Docker/native checks and relocated production-only closure; record unavailable prerequisites as incomplete.
- [x] 18.3 [S2.8] Run C2 in current required build order with supported worker/resource limits, review every changed authored file under use-effect and rerun checks invalidated by fixes; verify all owned processes/resources are cleaned up.
- [x] 18.4 [S2.8] Reconcile final ownership, API/config docs and measured budgets against S1.1, preserve historical failures and functional/performance distinction, then record final acceptance only if every required row passes without cloud/publication assumptions.

## Requirement coverage

Every design section below retains the original brief's obligations and its review additions. The matching task group implements the whole section, including its acceptance paragraph. Delta requirements express observable behavior; pure ownership/execution details remain in design/tasks.

| Source section  | Design decision                                                                    | Delta capabilities                                                          | Task group / evidence                 |
| --------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| S1.1            | Reproducible actual-consumer baselines and four boundaries                         | workspace-foundation; acceptance-verification                               | 1; baseline.json/stage-1.md           |
| S1.2            | Shared selected dependency metadata and producer integrity                         | workspace-foundation; provider-bindings                                     | 2; packed manifests/ranges            |
| S1.3            | Static preflight, correct resolver context and failure categories                  | provider-bindings; compiler-graph                                           | 3; typed diagnostics/no mutation      |
| S1.4            | Generic declarations versus explicit native execution                              | public-authoring; tools-agents                                              | 4; agent/native/state parity          |
| S1.5            | Independent transports/docs and core endpoint classification                       | http-runtime                                                                | 5; real HTTP/lifecycle/security       |
| S1.6            | Generic client/testing, selected frontend/auth/database                            | typed-agent-client; workspace-foundation                                    | 6; strict consumer declarations       |
| S1.7            | Runtime lifecycle, JS start, native artifact closure                               | cli-scaffolding; pulumi-aws-deployment; compiler-graph                      | 7; relocated production               |
| S1.8            | Lightweight observability and explicit local store                                 | observability                                                               | 8; history/worker/import proof        |
| S1.9            | Creator/wrapper/AST tooling/catalog/starter selection                              | cli-scaffolding; workspace-foundation                                       | 9; runner/no-install/repair           |
| S1.10           | Stage admission with exact temporary exceptions                                    | acceptance-verification                                                     | 10; stage-1.md                        |
| S2.1            | Omitted-disabled, bridge configuration, production exclusion                       | public-authoring; development-inspector; http-runtime                       | 11; four-state configuration matrix   |
| S2.2            | Private UI rename and standalone tool packaging                                    | development-inspector; cli-scaffolding; workspace-foundation                | 12; tarballs/runtime/process proof    |
| S2.3            | Session versus generation versus tool lifetime                                     | development-inspector; cli-scaffolding                                      | 13; reload/bind/restart cleanup       |
| S2.4            | Authenticated private discovery and live actions                                   | development-inspector; http-runtime                                         | 14; protocol/security/file ownership  |
| S2.5            | Tool-owned history, bounded collection and durable replay                          | observability; development-inspector; typed-agent-client                    | 15; commit/revision/fault/browser     |
| S2.6            | Independent restricted Docker execution                                            | development-inspector; developer-documentation                              | 16; native/container/network evidence |
| S2.7            | Executable docs/templates/skills and producer registration                         | developer-documentation; workspace-foundation                               | 17; generated/packed parity           |
| S2.8            | No-exception final gate and measured budgets                                       | acceptance-verification                                                     | 18; stage-2.md                        |
| Shared contract | Effect guidance, data preservation, selected frontend, four independent boundaries | existing acceptance-verification per-file review plus all applicable deltas | Every task; per-file review/evidence  |

## Implementation verification sequence

The current scripts below exist; they were **not executed as implementation validation during planning**. Regenerate dependency/generated artifacts intentionally through their authoritative producers during implementation. Run required prerequisite builds before checks that consume built outputs, and build the exact candidate before packed certification. Do not treat the textual list as permission to skip a script's prerequisites.

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

Execute focused consumer-install/type-isolation/lifecycle checks alongside their owning tasks. Required browser/container/scaffold/native evidence additionally uses `bun run test:inspector:browser`, `bun run test:container`, `bun run test:scaffold` and `bun run prepush:full` with real prerequisites. Preserve repository opt-in rules, use one constrained heavy job at a time, and do not enable paid/cloud tests without authorization.

Stage evidence records exact checkout/candidate hashes, ownership changes, before/after metrics, intentional API/config changes, actual commands/results, failure observations and environmental limits. Existing unrelated failures stay explicit. Local verification, hosted CI, publication and registry-consumer proof are separate outcomes. The active `separate-release-readiness-performance` proposal and its functional-versus-performance distinction remain unchanged.

## Planning-only completion checks

These are review criteria, not implementation checkboxes:

- OpenSpec reports proposal, all thirteen declared capability deltas, design and tasks present.
- Every original S1/S2 section and acceptance obligation has the design/delta/task mapping above.
- R1–R5 have named tests in their owning groups, plus use-effect verification throughout.
- Strict OpenSpec validation and whitespace checks pass; existing modified requirements retain applicable scenarios.
- Every implementation checkbox remains unchecked.
- Only this new change directory is written; unrelated work and the active release-readiness proposal are preserved.
