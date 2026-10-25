# Lean installation documentation alignment: audit and design

Date: 2026-10-24. Baseline: `39970e476b96380654cd3d68a310a0511a81c0ab`.
This is a planning artifact, not a claim that the documentation has been repaired.

## Confirmed problem and intended outcome

A reader starting with the lean minimal application must be able to select a capability,
install its adapter and required SDK/tooling in the right manifest sections, configure it,
and verify the advertised outcome without relying on workspace-hoisted packages.
The current site satisfies this in some guides and contradicts it in others.
The correction must cover each reader entry point, including its prerequisites and linked continuations.

The existing OpenSpec change already requires this behavior:
`openspec/changes/lean-installation-and-standalone-inspector/specs/developer-documentation/spec.md`,
“Reader selects an integration” and “Distribution guidance follows authoritative producers.”
Its task list being complete and CI being green do not establish this missing consumer acceptance.

## Reproduction performed

1. Opened the rendered `http://127.0.0.1:3001/docs/database/define` in an isolated
   agent-browser session. Its actual DOM prints
   `bun add @relkit/drizzle@0.0.5 drizzle-orm@1.0.0-rc.5-169397b`.
   Snapshot: `/tmp/relkit-docs-database-define-before.png`.
   Rendered text: `/tmp/relkit-docs-database-define-rendered.txt`.
2. Generated a real new minimal project through the current creator:
   `bun packages/create-relkit/dist/bin.js docs-audit --template minimal --no-install --no-git --json`,
   from the owned temporary parent `/tmp/relkit-docs-install-audit-AE9cuP`.
   The baseline manifest has `@relkit/app@0.7.10` and `@relkit/cli@0.7.11`,
   with no Drizzle, Better Auth, native agent engine, or Inspector tool.
3. Ran the real existing-project command from that project:
   `bun <checkout>/packages/cli/dist/bin.js add database --orm drizzle --dialect sqlite --no-install --json`.
   It selected runtime `@relkit/drizzle@0.7.10` and the pinned ORM, development
   `drizzle-kit@1.0.0-rc.5-ab785fc`, and the owned Drizzle patch/manifest registration.
   It explicitly skipped verification until installation. Raw result: `/tmp/relkit-docs-install-audit-AE9cuP/database-add.json`.
4. Exercised the real `mergeScaffoldManifest` with the guide's declared
   `@relkit/drizzle@0.0.5` and a current database selection. It rejected the mixed
   declaration with `RELKIT_ADD_COLLISION: package.json already declares @relkit/drizzle@0.0.5.`
   This is a native manifest-merging reproduction, not an assertion that the full printed
   tutorial was installed and run.
5. Opened and read the rendered native-agent tutorial. It installs only unversioned
   `langchain @langchain/langgraph`, while its included agent imports
   `defineAgent` from `@relkit/langchain`.
6. Ran the existing database, AI, and Start learning tests: **11 passed, 211 assertions**.
   They pass with the stale commands still present.
   Log: `/tmp/relkit-docs-baseline-tests.log`.

No SDK download, database migration, Docker lifecycle, cloud operation, benchmark matrix,
publication, or application runtime acceptance was performed for this audit.
The current docs dev server remains available on port 3001.

## Findings

| ID  | Confirmed gap                                                               | Authoritative evidence and consequence                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Stale RELKIT pins in database/auth setup                                    | `database/define`, `auth/better-auth`, and `database/better-auth` still select 0.0.5. Current adapter manifests and the actual scaffold select 0.7.10. Package versions must come from each owner/cohort, not a single assumed global version.                                                                                               |
| D2  | Database entry points do not present one complete installation path         | The manual setup omits the application-owned Drizzle patch demonstrated by the current scaffold. The conceptual/Drizzle pages expose examples before clearly identifying the setup prerequisite. Keep manual setup distinct from `relkit add database`, which already plans and normally installs its selected requirements.                 |
| A1  | Native-agent entry points have an incomplete install/configuration recipe   | `ai/agents` and `ai/first-agent` omit the native RELKIT owner and the full tested SDK cohort. The included template also needs explicit local realtime/agent-state bindings from `@relkit/local`; copying only its agent file is insufficient for a lean app. `ai/native-runtime` already has the complete SDK command and should be reused. |
| J1  | Provider guides list wrappers without the selected native SDK contract      | Inngest requires `inngest@4.20.0`; Effect MQ requires `effect-mq@0.7.0` and the pinned ORM/patch. Their existing-app instructions omit these SDK versions/sections. This is a documentation completeness finding; this audit did not run provider startup.                                                                                   |
| J2  | Trigger guide pins a different SDK than its adapter metadata                | Guide: 4.5.16; current requirement: 4.7.2. Align the installation contract while preserving the explicit unverified runtime status and rejected creation tuple. Do not “fix” certification claims from package installation alone.                                                                                                           |
| I1  | Start journey still promises automatic Inspector startup                    | `start/create-an-app` says the Inspector runs on 3210; `start/local-development` says dev starts background Inspector/persistence support. The minimal template omits inspection, and `dev-inspector-support.service.ts` owns only the authenticated bridge.                                                                                 |
| I2  | Feature tutorials use the Inspector without establishing its separate setup | Cache/upload/agent/database/event walkthroughs tell readers to open/invoke through the UI without enabling the bridge and explicitly installing/running the tool, or linking that prerequisite before use.                                                                                                                                   |
| O1  | Observability assigns history to the wrong process                          | It says the dev CLI acquires `@relkit/observability-local` and uses `RELKIT_OBSERVABILITY_ROOT`. The standalone Inspector owns `InspectorHistory` and the history directory; backend capture remains bounded and independent. Exporter setup also needs selected owner/SDK requirements.                                                     |
| P1  | Deployment page advertises an unavailable creation path                     | It presents `--cloud aws --deploy pulumi` as a working generator route, while the capability table and contributor deployment guide reject that tuple. Existing configured applications remain a separate supported path; their Pulumi/AWS requirements are deploy-only development dependencies.                                            |
| C1  | Frontend setup is only partially specified                                  | Client pages assume `@relkit/client`/CLI and use the separate Better Auth React leaf. Audit the full client/React/query/OTel peer set, frontend versus backend sections and roots, and exact optional feature selection against the client manifests. No frontend installation failure is claimed from this audit alone.                     |
| T1  | Existing validation can hide missing installation steps                     | `orders-tutorial-project.ts:74-77` symlinks the auth example's node_modules; `configureTutorial` synthesizes dependencies instead of following guide install commands. Keep that behavioral fixture if useful, but add a genuinely isolated package-consumer journey.                                                                        |

## Design and constraints

- Use each owner's package version, integration requirements and the portable scaffold catalog
  as authority. Integration recipes use `relkit.integration.dependencies` and
  `selectedIntegrationRequirements` for ranges, capability/phase selection and manifest sections.
  Scaffold-owned tools and repairs use the portable catalog and patch metadata.
- Requirements without integration records retain their existing owners. Selected HTTP transports
  use the pure `HTTP_TRANSPORT_REQUIREMENTS` in `packages/runtime-hono/src/selected-transports.ts`,
  checked against that package's optional peers. Frontend/query/Better Auth React leaves use
  their owning peer manifests and `resolveCatalogVersion` with the root default/named catalogs.
  Recipes supply install sections and phases only where these inputs do not specify them.
  Preserve the distinction between a supported peer range and an explicitly tested exact pin;
  never install all optional peers automatically or create a second version table.
  Keep source-only metadata access at the docs build boundary, without adding runtime/public
  exports or loading integration SDK implementations for documentation.
- Explain two supported paths where applicable: scaffold adds/installs selected dependencies;
  manual setup explicitly installs the adapter, native SDKs, tools, configuration and repairs.
  `--no-install` remains an explicit deferred install/check path.
- Each published guide is an installation entry point, a continuation with a named prerequisite,
  or a concept/reference page requiring no install block. Preserve sidebar order.
- Add only selected requirements. Core-only apps, tool-only MCP, frontend-only clients,
  native agents, deep agents, optional Scalar/AG-UI and deployment roles remain separate.
  Runtime, development and test ownership must stay explicit.
- Publish shared, metadata-derived installation fragments through the existing doc generator.
  Reuse them in task guides before feature code. Do not hand-edit API, CLI, navigation,
  related-content or template-build output.
- Reuse executable source includes and focused config regions, not whole commerce configurations.
  Continue the same Orders app; keep grouped service boundaries, existing flat support,
  environment fields, secrets, user data and applied migration history intact.
- Inspector instructions always separate install, bridge enablement and tool execution,
  UI and bridge addresses, Bun and Node requirements, production exclusion and bounded capture.
  Installation alone never enables inspection; no tool means no new persisted tool history.
- Preserve supported-creation/certification boundaries and current provider limitations.
  Do not run benchmarks, claim publication, spend cloud funds or change runtime architecture.
- Canonical READMEs, current contributor guidance and distributed skill/template sources are
  cross-checks, not permission to rewrite historical evidence or protected normative documents.
- Working calls made here: retain navigation and the existing package split; use one shared
  install renderer; recommend native sequential execution because all guide fixes depend on
  the same metadata contract. These are implementation recommendations, not new user requirements.

## Coverage universe

All **127 authored site guides** are assigned below. Generated API/CLI references are excluded
from hand editing and verified through their producers. Task ownership is a review/acceptance
assignment, not a claim that all 127 pages need prose changes.
Initial findings identify confirmed corrections; remaining pages require context review and may be retained.
A keyword scan is triage, not proof that every mention of Inspector needs a setup block.

Counts by implementation owner: Task 2 = 24, Task 3 = 32,
Task 4 = 43, Task 5 = 28. Their union must remain 127/127.

| Page under apps/docs/content/docs          | Task | Initial disposition                   |
| ------------------------------------------ | ---- | ------------------------------------- |
| `ai/agents.mdx`                            | 3    | A1                                    |
| `ai/approvals.mdx`                         | 3    | Verify prerequisite/retain if aligned |
| `ai/first-agent.mdx`                       | 3    | A1, I2                                |
| `ai/function-tools.mdx`                    | 3    | Verify prerequisite/retain if aligned |
| `ai/graphs-persistence.mdx`                | 3    | Verify prerequisite/retain if aligned |
| `ai/index.mdx`                             | 3    | Verify prerequisite/retain if aligned |
| `ai/mcp.mdx`                               | 3    | Verify prerequisite/retain if aligned |
| `ai/native-runtime.mdx`                    | 3    | Verify prerequisite/retain if aligned |
| `ai/streaming.mdx`                         | 3    | Verify prerequisite/retain if aligned |
| `ai/threads-recovery.mdx`                  | 3    | Verify prerequisite/retain if aligned |
| `ai/tools.mdx`                             | 3    | Verify prerequisite/retain if aligned |
| `auth/better-auth.mdx`                     | 2    | D1                                    |
| `auth/clients.mdx`                         | 2    | Verify prerequisite/retain if aligned |
| `auth/customization.mdx`                   | 2    | Verify prerequisite/retain if aligned |
| `auth/first-auth.mdx`                      | 2    | Verify prerequisite/retain if aligned |
| `auth/index.mdx`                           | 2    | Verify prerequisite/retain if aligned |
| `auth/protect-routes.mdx`                  | 2    | Verify prerequisite/retain if aligned |
| `auth/sessions.mdx`                        | 2    | Verify prerequisite/retain if aligned |
| `auth/testing.mdx`                         | 2    | Verify prerequisite/retain if aligned |
| `caching/define.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `caching/expiration.mdx`                   | 4    | Verify prerequisite/retain if aligned |
| `caching/first-cache.mdx`                  | 4    | I2                                    |
| `caching/index.mdx`                        | 4    | Verify prerequisite/retain if aligned |
| `caching/read-write.mdx`                   | 4    | Verify prerequisite/retain if aligned |
| `client/authentication.mdx`                | 3    | C1                                    |
| `client/index.mdx`                         | 3    | C1                                    |
| `client/mutations.mdx`                     | 3    | Verify prerequisite/retain if aligned |
| `client/offline.mdx`                       | 3    | Verify prerequisite/retain if aligned |
| `client/routes.mdx`                        | 3    | Verify prerequisite/retain if aligned |
| `client/ssr.mdx`                           | 3    | Verify prerequisite/retain if aligned |
| `client/streams.mdx`                       | 3    | Verify prerequisite/retain if aligned |
| `database/better-auth.mdx`                 | 2    | D1                                    |
| `database/define.mdx`                      | 2    | D1, D2                                |
| `database/drizzle.mdx`                     | 2    | D2                                    |
| `database/first-database.mdx`              | 2    | D2, I2                                |
| `database/generated-schemas.mdx`           | 2    | Verify prerequisite/retain if aligned |
| `database/index.mdx`                       | 2    | Verify prerequisite/retain if aligned |
| `database/migrations.mdx`                  | 2    | Verify prerequisite/retain if aligned |
| `database/models.mdx`                      | 2    | Verify prerequisite/retain if aligned |
| `database/overrides.mdx`                   | 2    | Verify prerequisite/retain if aligned |
| `database/queries.mdx`                     | 2    | Verify prerequisite/retain if aligned |
| `database/schema.mdx`                      | 2    | Verify prerequisite/retain if aligned |
| `database/testing.mdx`                     | 2    | Verify prerequisite/retain if aligned |
| `database/transactions.mdx`                | 2    | Verify prerequisite/retain if aligned |
| `events/consume.mdx`                       | 5    | Verify prerequisite/retain if aligned |
| `events/define.mdx`                        | 5    | Verify prerequisite/retain if aligned |
| `events/first-event.mdx`                   | 5    | I2                                    |
| `events/index.mdx`                         | 5    | I2                                    |
| `events/publish.mdx`                       | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/application.mdx`             | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/context.mdx`                 | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/environment.mdx`             | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/errors.mdx`                  | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/functions.mdx`               | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/index.mdx`                   | 5    | Verify prerequisite/retain if aligned |
| `fundamentals/schemas.mdx`                 | 5    | Verify prerequisite/retain if aligned |
| `http/define.mdx`                          | 3    | Verify prerequisite/retain if aligned |
| `http/first-route.mdx`                     | 3    | Verify prerequisite/retain if aligned |
| `http/generated-clients.mdx`               | 3    | Verify prerequisite/retain if aligned |
| `http/index.mdx`                           | 3    | Verify prerequisite/retain if aligned |
| `http/middleware.mdx`                      | 3    | Verify prerequisite/retain if aligned |
| `http/openapi.mdx`                         | 3    | Verify prerequisite/retain if aligned |
| `http/rate-limits.mdx`                     | 3    | Verify prerequisite/retain if aligned |
| `http/raw-handlers.mdx`                    | 3    | Verify prerequisite/retain if aligned |
| `http/requests.mdx`                        | 3    | Verify prerequisite/retain if aligned |
| `http/responses.mdx`                       | 3    | Verify prerequisite/retain if aligned |
| `http/routes.mdx`                          | 3    | Verify prerequisite/retain if aligned |
| `http/streaming.mdx`                       | 3    | Verify prerequisite/retain if aligned |
| `http/uploads.mdx`                         | 3    | Verify prerequisite/retain if aligned |
| `index.mdx`                                | 5    | Verify prerequisite/retain if aligned |
| `integrations/index.mdx`                   | 4    | Verify prerequisite/retain if aligned |
| `integrations/local-docker.mdx`            | 4    | Verify prerequisite/retain if aligned |
| `jobs/bindings.mdx`                        | 4    | Verify prerequisite/retain if aligned |
| `jobs/clients.mdx`                         | 4    | Verify prerequisite/retain if aligned |
| `jobs/deployment.mdx`                      | 4    | Verify prerequisite/retain if aligned |
| `jobs/docker.mdx`                          | 4    | Verify prerequisite/retain if aligned |
| `jobs/durations-and-sleep.mdx`             | 4    | Verify prerequisite/retain if aligned |
| `jobs/execution-policy.mdx`                | 4    | Verify prerequisite/retain if aligned |
| `jobs/index.mdx`                           | 4    | Verify prerequisite/retain if aligned |
| `jobs/inspector.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `jobs/migration.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `jobs/progress-and-streams.mdx`            | 4    | Verify prerequisite/retain if aligned |
| `jobs/providers/comparison.mdx`            | 4    | Verify prerequisite/retain if aligned |
| `jobs/providers/effect-mq.mdx`             | 4    | J1                                    |
| `jobs/providers/inngest.mdx`               | 4    | J1                                    |
| `jobs/providers/trigger.mdx`               | 4    | J2                                    |
| `jobs/providers.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `jobs/quickstart.mdx`                      | 4    | Verify prerequisite/retain if aligned |
| `jobs/retries-and-idempotency.mdx`         | 4    | Verify prerequisite/retain if aligned |
| `jobs/schedules.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `jobs/security.mdx`                        | 4    | Verify prerequisite/retain if aligned |
| `jobs/tasks.mdx`                           | 4    | Verify prerequisite/retain if aligned |
| `jobs/testing.mdx`                         | 4    | Verify prerequisite/retain if aligned |
| `jobs/troubleshooting.mdx`                 | 4    | Verify prerequisite/retain if aligned |
| `operations/deployment.mdx`                | 4    | P1                                    |
| `operations/index.mdx`                     | 5    | Verify prerequisite/retain if aligned |
| `operations/inspector.mdx`                 | 5    | Verify prerequisite/retain if aligned |
| `operations/observability.mdx`             | 4    | O1                                    |
| `operations/realtime-agents-streaming.mdx` | 4    | Verify prerequisite/retain if aligned |
| `operations/testing.mdx`                   | 3    | Verify prerequisite/retain if aligned |
| `operations/troubleshooting.mdx`           | 5    | Verify prerequisite/retain if aligned |
| `realtime/access.mdx`                      | 4    | Verify prerequisite/retain if aligned |
| `realtime/index.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `realtime/presence.mdx`                    | 4    | Verify prerequisite/retain if aligned |
| `realtime/providers.mdx`                   | 4    | Verify prerequisite/retain if aligned |
| `realtime/react.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `realtime/recovery.mdx`                    | 4    | Verify prerequisite/retain if aligned |
| `service/define.mdx`                       | 5    | Verify prerequisite/retain if aligned |
| `service/domains.mdx`                      | 5    | Verify prerequisite/retain if aligned |
| `service/first-service.mdx`                | 5    | Verify prerequisite/retain if aligned |
| `service/index.mdx`                        | 5    | Verify prerequisite/retain if aligned |
| `service/migration.mdx`                    | 5    | Verify prerequisite/retain if aligned |
| `service/organization.mdx`                 | 5    | Verify prerequisite/retain if aligned |
| `service/routes.mdx`                       | 5    | Verify prerequisite/retain if aligned |
| `start/add-artifacts.mdx`                  | 5    | Verify prerequisite/retain if aligned |
| `start/build-and-run.mdx`                  | 5    | Verify prerequisite/retain if aligned |
| `start/create-an-app.mdx`                  | 5    | I1                                    |
| `start/first-route.mdx`                    | 5    | Verify prerequisite/retain if aligned |
| `start/local-development.mdx`              | 5    | I1                                    |
| `start/protect-orders.mdx`                 | 2    | Verify prerequisite/retain if aligned |
| `start/save-orders.mdx`                    | 2    | Verify prerequisite/retain if aligned |
| `start/test-orders.mdx`                    | 2    | Verify prerequisite/retain if aligned |
| `storage/define.mdx`                       | 4    | Verify prerequisite/retain if aligned |
| `storage/first-upload.mdx`                 | 4    | I2                                    |
| `storage/index.mdx`                        | 4    | Verify prerequisite/retain if aligned |
| `storage/read-delete.mdx`                  | 4    | Verify prerequisite/retain if aligned |
| `storage/upload.mdx`                       | 4    | Verify prerequisite/retain if aligned |

## Acceptance

- Every page above has a final retain/update disposition, and each installation recipe has
  a metadata/manifest comparison test plus a real isolated consumer proof where executable.
- Fresh minimal, SQLite database, Better Auth, offline native agent, optional transports and
  separate Inspector journeys use packed local artifacts outside the monorepo with no
  workspace node_modules links or undeclared optional packages.
- Provider/cloud recipes receive package/phase/configuration validation without treating it
  as provider-native execution or certification; external/cloud acceptance remains explicitly bounded.
- A browser check follows the main entry points and prerequisite links, including direct
  deep links. Guide code and successful guide installation remain distinct verification claims.
