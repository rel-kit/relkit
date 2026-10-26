# Lean Installation Documentation Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every current guide teach a complete, correctly scoped installation and configuration path for the lean package split and standalone Inspector.

**Architecture:** Keep the runtime/package split unchanged. Reuse the existing package requirement metadata, portable scaffold catalog, canonical examples and documentation generator to emit shared installation guidance. Audit entry points and continuations separately, and prove selected journeys in isolated consumers rather than relying on the monorepo's installed packages.

**Tech Stack:** Bun 1.3.10, strict TypeScript, Effect 4.0.1 where tooling workflows require it, Next.js 16.3.8/Fumadocs MDX, existing Bun and browser tests, local packed RELKIT artifacts.

**Spec:** [Audit, design and complete 127-page scope](../specs/2026-10-24-lean-installation-docs-alignment.md), implementing the existing [developer-documentation requirements](../../../openspec/changes/lean-installation-and-standalone-inspector/specs/developer-documentation/spec.md).

## Global Constraints

- Preserve the existing public package split and installation/runtime semantics.
- Derive each RELKIT package version from its own release metadata; the observed cohort includes app/adapters 0.7.10 and CLI/creator 0.7.11. Do not force every package to one version.
- Derive integration SDK ranges, selected capabilities/phases and manifest sections from `relkit.integration.dependencies`; use the portable scaffold catalog for scaffold-owned tools and repair metadata. Selected HTTP transports use the existing pure `HTTP_TRANSPORT_REQUIREMENTS`, verified against their owner's optional peers. Frontend/query/Better Auth React leaves use owner peer manifests resolved through the root default/named catalogs; recipes own sections/phases only where those sources do not specify them. Preserve supported ranges versus tested exact pins, and never select every optional peer automatically.
- Minimal creation, examples enabled, no jobs/cloud/deployment is the currently certified public tuple. Preserve rejected tuples and unverified native-provider limits.
- App descriptors remain plain TypeScript. Use source includes, grouped service roots, existing config regions and public APIs; preserve flat-layout compatibility.
- Keep navigation order, user data, existing database/schema/migration history, credentials, dirty AGENTS.md and Next-generated next-env.d.ts unchanged.
- Generate API/CLI/navigation/related/installation outputs through their producers; never hand-edit them.
- No benchmark matrices, cloud spend, publication, destructive lifecycle operations or Git operations without the relevant authorization. Leave this work uncommitted by default.
- Every one of the 127 audited guide pages needs a recorded retain/update disposition. A linked prerequisite may replace a repeated install block; concept/reference pages do not need invented prerequisites.
- New non-trivial tooling/tests follow applicable AGENTS/use-effect guidance, existing service boundaries and file-size rules. Reuse existing test/process/resource owners.

## Review Focus

- Independent versioning or changed SDK metadata must update guidance without silently changing unrelated capability requirements. Covered by Task 1 metadata/phase tests.
- Adding database/auth to an existing app must preserve its data, singleton services, migration history and existing dependency declarations. Covered by Task 2 consumer/control cases.
- A lean app must not get native-agent, frontend/query, MCP, AG-UI or Scalar packages merely because a neighboring example uses them. Covered by Task 3 selection controls and Task 6 closure checks.
- Unsupported creation tuples and unverified provider runtime capabilities must remain explicitly unsupported after documentation changes. Covered by Task 4 capability-table checks.
- A headless backend must work with no Inspector tool, Next, DuckDB or Node UI prerequisite; enabling the bridge must not install/start the tool. Covered by Task 5 native checks and Task 6 separate-process acceptance.

---

### Task 1: Add metadata-backed installation guidance and coverage checks

**Files:** Create `apps/docs/scripts/generate-installations.ts`, `apps/docs/scripts/installation-catalog.ts`, `apps/docs/scripts/installation-catalog.types.ts` and `apps/docs/scripts/installation-recipes.ts`; modify `apps/docs/scripts/generate.ts`; test in `apps/docs/tests/installation-guidance.test.ts`. Reuse `guide-catalog.ts` as the page universe and existing `documentation-catalog.ts` for package locations. Add `@relkit/contracts: workspace:*` to the docs devDependencies for its existing requirement selector; update the lockfile with Bun without upgrading unrelated packages.

**Interfaces:**

- Consumes existing integration requirement records, each owner's manifest version, `selectedIntegrationRequirements(requirements, capabilities, phase)`, `SCAFFOLD_DEPENDENCIES`, and portable patch metadata. Load metadata only, never integration SDK implementations.
- For MCP/AG-UI/Scalar, consume the pure `HTTP_TRANSPORT_REQUIREMENTS` from `packages/runtime-hono/src/selected-transports.ts` at the docs build boundary and compare it with the owner's optional peers. For selected client/React/query/Better Auth React leaves, read the owner peer manifests and use the existing creator `resolveCatalogVersion` with the root default/named catalogs. Recipes supply sections/phases when absent from those inputs. Do not extend runtime metadata or public exports solely for docs, or replace supported peer ranges with invented tested pins.
- Produces `generateInstallations(root: string, emit: (path: string, value: string) => Promise<void>): Promise<void>` at the existing generator boundary and `content/generated/installations/<recipe>.mdx`.
- Recipe data selects packages/capabilities/phases, scaffold-only tools/repairs and prerequisite pages; it contains no duplicated SDK/RELKIT version literals.

- [ ] **Step 1: Add failing contract tests.** Assert database runtime versus Drizzle Kit development sections, all four native-agent SDK requirements, selected-only deep-agent/MCP/Scalar/AG-UI requirements, deploy-only Pulumi/AWS sections, and per-owner versions. Cover frontend leaf selection, required versus optional peers, named catalog resolution, recipe-owned sections and HTTP requirement/peer agreement. Compare expected values to the real owning metadata/manifests/catalogs, not new copied golden tables. Assert all 127 guide IDs have an explicit installation/continuation/concept disposition and every prerequisite resolves.
- [ ] **Step 2: Run `bun test apps/docs/tests/installation-guidance.test.ts`.** Baseline must fail for the stale database pin and incomplete agent/provider recipes; record those failures before repair.
- [ ] **Step 3: Implement the generator and bounded recipe/policy data.** Reuse the current emit/check path, with runtime and development install commands separated and package ranges shell-quoted. Include explicit repair/tooling steps. Add missing/incompatible dependency guidance using existing diagnostic codes and install commands. A guide can reuse a fragment or link a named prerequisite before its first feature-dependent action.
- [ ] **Step 4: Regenerate and test.** Run the new test, `bun --cwd=apps/docs run generate`, and `bun --cwd=apps/docs run generate:check`. Confirm a second generation is stable and outputs respond to a changed metadata fixture. Preserve API/CLI ownership and keep unknown recipe/package selections fail-closed.

### Task 2: Repair database, auth and the continuous Orders journey

**Files:** All 13 `content/docs/database/*.mdx`, all 8 `auth/*.mdx`, and Start `save-orders`, `protect-orders`, `test-orders` (24 pages, exact IDs in the audit). Extend `database-learning.test.ts`, `auth-learning.test.ts` and `start-learning.test.ts`. Use existing `apps/docs/examples/orders-tutorial`, `examples/data-model`, `examples/auth-drizzle` and scaffold producers as executable sources.

**Interfaces:** Consumes Task 1 database/auth recipes. Produces working manual and scaffold setup entry points, named prerequisites on continuations, and one coherent create → database → auth → tests journey.

- [ ] **Step 1: Add failing regressions.** Assert the current adapter cohort is used, ORM/Kit sections match the actual scaffold, selected Drizzle patch registration and Better Fetch overrides are documented, and migration commands follow install/schema/environment preparation. Add a control preserving pre-existing SQLite data/history and a refusal for incompatible authored declarations.
- [ ] **Step 2: Update the pages at their sources.** Explain that `relkit add database/auth` already plans and normally installs selected requirements; do not add a conflicting mandatory manual install first. Show the separate manual path, `--no-install` completion, Bun-native dialect choices and any selected declaration peers. Link the setup before code on direct-entry pages.
- [ ] **Step 3: Verify a fresh packed SQLite/auth consumer.** Follow the documented selected installs/repairs, check, strict typecheck, migrate a new owned database, invoke real signup/protected HTTP and restart/read persisted data. Run the existing app's data/history control separately. No workspace node_modules links or whole-example manifest replacement.
- [ ] **Step 4: Run focused docs/example checks.** `bun test apps/docs/tests/database-learning.test.ts apps/docs/tests/auth-learning.test.ts apps/docs/tests/start-learning.test.ts`, then the affected existing data-model/auth test scripts. Record each of the 24 retain/update decisions.

### Task 3: Align AI, frontend, testing and optional transport entry points

**Files:** All 11 `ai/*.mdx`, 7 `client/*.mdx`, 13 `http/*.mdx`, and `operations/testing.mdx` (32 pages). Extend `ai-learning.test.ts`, `http-learning.test.ts` and the installation tests. Use maintained agent/config/test and commerce-web includes; change those examples only if needed to make the documented isolated flow executable.

**Interfaces:** Consumes Task 1 native-agent, generic-tools, frontend, MCP, Scalar and AG-UI selections. Produces explicit backend/frontend/test ownership and a credential-free existing-minimal-app agent path.

- [ ] **Step 1: Add failing cases.** Native `ai/first-agent` must install `@relkit/langchain` and the four selected SDKs before its included native agent. It must extend realtime/agent-state config (and select `@relkit/local`) as required. Tool-only/MCP must not select the native model engine; frontend-only installation must not select backend/database packages; optional Scalar/AG-UI remain independent.
- [ ] **Step 2: Repair entry points and prerequisite links.** Reuse the complete native-runtime cohort instead of leaving two incomplete unversioned install commands. Describe `@relkit/agents` versus `@relkit/langchain`, native testing leaves, deep-agent gates and model-provider selection. Specify client/React/query/OTel and Better Auth React prerequisites in the frontend root, with CLI/tooling in its proper section. Preserve offline examples and unsupported creation tuples.
- [ ] **Step 3: Verify isolated outcomes.** From a minimal consumer, follow the native-agent file/config steps and execute the deterministic greeting test, check and typecheck. Separately verify tool-only MCP discovery, optional transport dependency checks, and frontend contract pull/typecheck without backend source imports. Do not call paid models or treat deep-agent SDK installation as certification.
- [ ] **Step 4: Run focused docs/tests.** Run AI/HTTP/installation learning suites and affected native/client tests once after their inputs settle. Record all 32 dispositions, distinguishing an existing-app tutorial from an unavailable agent/fullstack creator choice.

### Task 4: Align provider, resource, telemetry and deployment recipes

**Files:** `jobs/**` (22), `caching/*` (5), `storage/*` (5), `realtime/*` (6), `integrations/*` (2), and Operations `observability`, `deployment`, `realtime-agents-streaming` (43 pages). Extend existing jobs/caching/storage/event tests and installation checks; use current provider/telemetry config regions.

**Interfaces:** Consumes Task 1 selected runtime/local/exporter/deployment recipes. Produces accurate package/phase prerequisites with current native-provider limitations intact.

- [ ] **Step 1: Add failing metadata/claim cases.** Pin Inngest and Effect MQ SDK contracts and patch ownership; detect the Trigger 4.5.16 versus current 4.7.2 mismatch; separate AWS/Pulumi deployment peers from production requirements; reject documentation recommending unavailable creation tuples as supported.
- [ ] **Step 2: Repair recipes and continuations.** Keep Redis/S3/Docker examples that already install the correct owners, adding only genuinely selected requirements from metadata. Document local runtime versus Docker selection; specify exporter owners and Sentry's selected SDK. Fix deployment to start from an existing configured app. Preserve Trigger's unverified status and all capability/evidence limits.
- [ ] **Step 3: Correct history ownership in observability.** Remove dev-CLI DuckDB/Node-worker claims and obsolete directory overrides. Teach bounded backend capture, standalone tool persistence, overflow/gaps, external sampling and exporter isolation; link Task 5's setup. Preserve existing history and diagnostic boundaries.
- [ ] **Step 4: Validate packages/config locally.** Run selected installation/preflight, check/typecheck/build tests against isolated consumers, plus existing focused learning tests. These are installation/configuration proofs; provider-native execution, Docker lifecycle, AWS and performance acceptance remain separate. Do not rerun benchmark matrices or claim native certification from these checks. Record 43 dispositions.

### Task 5: Repair standalone Inspector onboarding and all cross-guide assumptions

**Files:** Remaining 28 pages: root index, Start `create-an-app`, `first-route`, `local-development`, `build-and-run`, `add-artifacts`; all `fundamentals/*`, `service/*`, `events/*`; Operations `index`, `inspector`, `troubleshooting`. Also fix Inspector-dependent actions on Tasks 2–4 pages. Cross-check README.md, docs/getting-started.md, docs/deployment.md, docs/architecture.md, packages/inspector/README.md, current template READMEs and authored distributed skill references; retain already aligned text.

**Interfaces:** Consumes the existing authenticated-bridge and tool/history contracts plus Task 1 tool recipe. Produces one complete install → enable → run procedure and explicit prerequisite links before Inspector-only actions.

- [ ] **Step 1: Add failing guidance/native controls.** Current minimal must advertise backend/OpenAPI only. A disabled app acquires no tool/history; bridge enablement starts no UI/store; explicitly starting/stopping the tool preserves backend availability and existing history. UI port and bridge address must remain separate.
- [ ] **Step 2: Update canonical setup and all affected promises.** Include release/candidate availability, explicit tool installation, Bun/Node prerequisites, bridge config, independent terminal command, session selection and persistent history ownership. Replace “dev starts Inspector” claims. Feature tutorials either establish this setup or link it before UI invocation; keep an HTTP/test verification option when inspection is optional.
- [ ] **Step 3: Reconcile distributed guidance.** Update only canonical authored sources that contradict the procedure; use existing producers for template/build copies and check that copies agree. Do not rewrite protected specs, historical evidence, API/CLI generated output or already-correct READMEs.
- [ ] **Step 4: Verify native and browser flows.** Run the focused existing standalone Inspector/bridge/no-tool tests, then render Create, Local development, Database, AI, cache/upload and observability pages. Follow prerequisite links directly from feature deep links. Record the remaining 28 dispositions and the cross-cutting repairs.

### Task 6: Prove complete consumer coverage and close the documentation acceptance gap

**Files:** Add `apps/docs/scripts/check-installation-workflows.ts` and `apps/docs/tests/installation-workflows.test.ts`; extend `apps/docs/scripts/orders-tutorial-project.ts` and its process/types owners only where needed to reuse their resource lifetime. Add `apps/docs/tests/installation-coverage.test.ts`. Add a docs-package `test:installations` script running `bun run scripts/check-installation-workflows.ts`; wire that explicit bounded check into the existing PR CI workflow. Keep fast workspace behavior tests distinct from this consumer runner. Reuse existing local packed-registry/process tooling instead of creating a second registry or process manager.

**Interfaces:** Consumes Tasks 1–5's documented recipes and page dispositions. Produces exact-revision acceptance evidence for installation correctness, separate from existing workspace behavior tests.

- [ ] **Step 1: Add negative isolation tests.** A workspace node_modules symlink, broad example manifest, undeclared SDK, or manually synthesized replacement dependency set must not count as an installation proof. Verify missing selected adapters/peers fail before evaluation and unselected peers stay unnecessary. Keep existing fast behavioral fixtures if useful, but label their scope.
- [ ] **Step 2: Execute bounded packed journeys.** Run `bun --cwd=apps/docs run test:installations`. Reuse one exact local packed cohort outside the repo and perform real installs with only the guide's selected declarations/repairs. Cover minimal/headless, SQLite/auth, offline native agent, tool-only MCP, optional transports/frontend, and independently enabled/run Inspector. Capture manifest sections, check/typecheck/test/build/native outcomes and owned cleanup. The runner must not silently fall back to workspace links or skip a failed native case; build its package prerequisites before eager imports on a cold CI checkout.
- [ ] **Step 3: Reconcile coverage and regenerate once.** Require 127/127 dispositions, no unresolved prerequisite, no mixed RELKIT cohort, no missing selected SDK, and no stale Inspector owner claim. Run `bun --cwd=apps/docs run generate`, `bun run test:docs`, relevant consumer checks and `git diff --check`. Run the required pre-push gate before any later authorized push.
- [ ] **Step 4: Review the finished site and evidence.** Inspect representative rendered direct-entry pages and continuous Orders links. Report exactly which install/runtime/browser checks passed and what remains outside scope. Stop all test-owned processes/containers, preserve the user's docs server and data, and obtain one final independent whole-change review. Do not mark documentation acceptance complete on generation/link tests alone.

## Handoff

The request currently authorizes reproduction and a reviewable plan. No site/runtime implementation
has started. Recommend native sequential execution with one final independent reviewer: the shared
metadata and cross-guide ownership decisions make parallel guide editing unnecessary.
Review the audit and this plan before implementation. No commit, push, merge, publication, cloud
operation or benchmark rerun is part of this planning handoff.
