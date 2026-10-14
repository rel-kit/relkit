## Context

See [proposal.md](proposal.md) for motivation and the six capability deltas for behavioral requirements. Planning was grounded in local `main` at `74c915449`, with a clean starting worktree and no active changes. Recheck this baseline before implementation; no remote synchronization or implementation acceptance is implied.

The current `domain-services` contract fixes boundaries at `src/<domain>/service.ts`. Compiler ownership and validation construct those paths directly, and `services` appears in `LEGACY_ROOTS`. `discovery/source-id-helpers.ts` strips descriptor categories at a fixed segment position; inserting a directory without updating this logic changes inferred identities. Boundary resolution and generated provenance need coordinated changes rather than a permissive root-name edit.

`packages/contracts` is already an internal dependency of compiler, CLI, and `packages/create-relkit`, making it a cycle-free home for pure shared layout contracts. Compiler source analysis and filesystem resolution remain compiler responsibilities. The current creation allow-list in `packages/create-relkit/src/create-capabilities.ts` certifies only minimal/no jobs/no cloud/no deployment/examples enabled at version 0.7.5. Template candidates and publicly supported creation tuples are therefore different coverage sets.

Initial impact map, to expand into a file-level inventory during phase 1:

| Surface                   | Starting points and dependency to audit                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ownership and boundaries  | `packages/compiler/src/normalize-domain-helpers.ts`, `normalize-domains.ts`, `normalize-boundaries.ts`, `normalize-domain-routes.ts`        |
| Identity and diagnostics  | `discovery/source-id*.ts`, `normalize-source-identities*.ts`, `conventions*.ts`, related locations and generated declarations               |
| Discovery and lifecycle   | Compiler discovery/config loaders/watch; CLI check/build, `commands/dev-watch.ts`, source watcher, `dev-snapshot/` and generation packaging |
| Scaffolding and packaging | `packages/create-relkit`, CLI command metadata/add integration, template packaging, creation capability digests                             |
| Downstream consumers      | Client generation, runtime/testing loaders, integration metadata, deployment planning, Inspector source links and grouping                  |
| Executable guidance       | `templates/default/v1`, `examples/commerce`, tests, docs includes/reference inputs, scripts, guardrails, agent instructions                 |

Search both literal paths and structural assumptions: first-segment indexing, fixed-depth category stripping, regular expressions, globs, alias targets, service lookup, executable references, and source-relative identity. This map is a planning baseline, not a claim that the implementation audit is complete. Existing unrelated spec/code drift stays outside this change.

## Goals / Non-Goals

**Goals:** one immutable layout interpretation shared by all consumers; identity-neutral source movement; explicit analysis limits; reversible migration; evidence that behavior, security, ownership, and durable state survive.

**Non-Goals:** changing authoring APIs or capability semantics, promoting uncertified template/provider tuples, demanding identical graph/build bytes across physically different trees, or automatically moving user applications during upgrade. Implementation must apply the complete use-effect contract described in decision 9 while preserving public authoring APIs.

## Decisions

### 1. Fixed roots with authored-evidence selection

Represent `flat` and `grouped` as the only application layouts. Produce a sorted immutable layout record containing application root, selection evidence, service names/roots/boundaries, layer classification, and service-relative paths. Pure classification types and path transformations live in `packages/contracts`; compiler discovery supplies validated authored evidence. Export only through internal package surfaces, not the public `relkit` authoring facade. CLI/generator consume the same model and evidence semantics.

Select using service declarations and graph-visible candidates, including descriptors whose boundary is missing; do not infer layout from empty directories or every helper folder. A helper-only folder remains unowned unless it lies inside an evidenced service. Helpers outside a service do not create a new application dependency layer: application imports into them must be moved to Platform or an owning service. Reject mixed evidence before normal ownership assignment and report duplicate logical services with both locations. Preserve the existing invalid layer-first roots. Empty applications default to grouped.

`src/services/service.ts` cannot be an aggregate service. Only immediate children of `src/services` can own services; arbitrary deeper helper/capability folders are allowed, but a nested independent service descriptor is an error. Flat compatibility retains existing valid naming constraints.

Normalize separators and project-relative paths at the input boundary, retain physical provenance separately, and validate containment before classification. Reject case-folding collisions rather than picking an enumeration-order winner. Resolve symbolic links before validating ownership: in-root links that retain the same owner/layer can be canonicalized and deduplicated; links crossing owners/layers, duplicating a service root, or escaping source containment fail. Migration refuses touched symlinked paths with a manual-action diagnostic rather than moving their targets implicitly. Dependency-package symlinks are not authored service roots.

Alternatives considered: a user-configurable root expands every compatibility axis; partial migration introduces ambiguous scaffold ownership; stripping `services` everywhere corrupts legitimate deeper names. A fixed selected root avoids all three.

### 2. Logical path projection is separate from physical provenance

Derive an identity path for grouped service sources equivalent to `src/<service>/<relative-source>`, then apply the existing kind/category, binding/default-export, error, and service-member rules. Remove only the recognized grouping segment, never an arbitrary `services` component. Explicit IDs remain authoritative, subject to existing validation. Reference rewriting and executable binding use the same resolved IDs.

Keep actual grouped paths in diagnostics, source maps, manifests, editor links, and module imports. Compare a dedicated logical contract projection before/after migration: kind-qualified IDs, member names/exposure, ownership/dependency edges, routes/methods/schemas, event/job/channel/agent registries, provider bindings, and deployment resource identities. Source paths, source locations, and executable/build hashes are excluded only where they are physical provenance; no public contract field is normalized away.

Reuse graph diff classification for source-only movement. Build identity can change because executable content/provenance changes. Accepted work remains pinned to its immutable build under existing provider routing; retain required old artifacts, never relabel incompatible executables. Prove native recovery before claiming compatibility.

Alternative rejected: whole-graph equality hides accurate provenance or forces unsafe reuse of old build fingerprints.

### 3. Boundary checking includes helper dependency graphs

Use the effective project TypeScript configuration, including `extends`, `baseUrl`, `paths`, module-resolution mode, and `.js` to TypeScript resolution. Analyze static imports, type-only imports, re-exports, and string-literal dynamic imports. Record and validate each source edge, including helper and barrel edges, so permitted imports cannot conceal forbidden internals.

| Importer                      | Allowed application targets                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Service                       | Own internals, other services' public `service.ts`, Platform                                              |
| Routes and HTTP middleware    | Routes helpers, public service boundaries, Platform                                                       |
| Platform                      | Platform                                                                                                  |
| `relkit.config.ts`            | Platform configuration/environment support                                                                |
| Tests and operational scripts | Explicit test/operation access to service internals where needed; not imported back into application code |

Unresolved static application references fail through existing resolution diagnostics. Computed or unresolved dynamic imports produce a source-located, nonfatal analysis-limit warning: their boundary safety is not proven. Migration treats a potentially affected unresolved reference as a blocking manual action. This preserves compatibility without advertising complete enforcement of arbitrary JavaScript. Literal dynamic imports are fully checked.

Alternative rejected: checking only candidate descriptors leaves helper/barrel bypasses; treating all dynamic code as safe creates false security guarantees.

### 4. Optional organization stays ordinary TypeScript

The structural reference below describes placement, not a list of required generated folders. Compiler rules enforce roots, owners, one public boundary, route discovery, and imports. Existing filename/category warnings retain their severity. Policies, integration adapters local to an application, agent model helpers, prompts/templates, and config fragments gain no new registration behavior.

```text
application/
├── relkit.config.ts
├── package.json, tsconfig.json, bunfig.toml
├── drizzle.config.ts                   # When database tooling is used
├── .env.example
├── .env.local                          # Ignored
├── .env.test                           # Isolated safe test values
├── .env.staging.example, .env.production.example
├── src/
│   ├── services/
│   │   ├── database/
│   │   │   ├── service.ts, client.ts
│   │   │   ├── schema/index.ts
│   │   │   └── models/, overrides/
│   │   ├── auth/
│   │   │   └── service.ts, plugins.ts, hooks.ts
│   │   └── <business-service>/
│   │       ├── service.ts, schemas.ts
│   │       ├── functions/, events/, tasks/, jobs/, channels/
│   │       ├── agents/
│   │       │   └── models/, middleware/
│   │       ├── tools/, prompts/, cache/, buckets/
│   │       ├── constants/, errors/, policies/
│   │       └── integrations/, templates/
│   ├── routes/
│   │   ├── api/auth/[[...auth]]/route.ts
│   │   ├── <resource>/**/route.ts
│   │   └── middleware/, transforms/, responses/
│   └── platform/
│       ├── env.ts, schemas/
│       └── config/
│           ├── server.ts, inspector.ts, telemetry.ts, deployment.ts
│           └── providers/
│               └── cache.ts, buckets.ts, jobs.ts, realtime.ts, agent-state.ts
├── migrations/
├── scripts/database/, scripts/operations/
├── tests/unit/, integration/, e2e/, evals/, fixtures/, helpers/
└── .relkit/                            # Owned output and local state
```

Database keeps `defineDrizzleService`, schema registration, models/overrides, lazy activation, transaction semantics, and disposal. Auth keeps its native specialized options, sole database association, one raw route mount, and borrowed database lifetime. Do not introduce generic wrappers or `dependencies.database`. Membership does not imply realtime/agent/job external exposure; preserve the existing independent declarations and partition/thread authorization.

`relkit.config.ts` remains the composition root. Platform fragments are explicitly imported and included in dependency fingerprints. Preserve environment contract versus binding reference semantics and actual dotenv behavior; environment example names do not imply loading and CLI `--environment` does not select a similarly named dotenv file. Compilation must not construct live resources.

Alternative rejected: autoloading every folder changes APIs and side effects; generating the complete tree makes minimal applications misleading.

### 5. Layout participates in invalidation, not durable identity

Track selection evidence, added/deleted boundaries, module-resolution configuration, imported helpers/assets, config fragments, and environment contracts in discovery/watch/prepared snapshot inputs. Version cache interpretation when necessary and reject stale cohorts before importing their startup closure. Reuse existing atomic publication, latest-epoch activation, bounded cleanup, and last-known-good behavior.

Generated/build cleanup must operate on explicit owned paths. `.relkit/state`, agent journals, accepted job state, and `.relkit/observability` are preserved. Inspector reads graph ownership through its existing APIs and retains logical selection; source links use generation-matched actual paths or report unavailable.

Alternative rejected: deriving layout independently in Inspector, generator, or watchers creates divergent views even when compilation succeeds.

### 6. Migration is a planned transaction with local recovery

Introduce these commands through the existing CLI metadata/parser/help/completion path:

```sh
relkit migrate layout                    # Read-only plan
relkit migrate layout --json             # One machine-readable plan
relkit migrate layout --write            # Re-plan, validate, and apply
relkit migrate layout --rollback <receipt>
```

`--write` and `--rollback` are mutually exclusive. Explicit write requires no additional confirmation. Preview is nonmutating, including no project-local generation or receipts; any required compilation uses an isolated temporary workspace with cleanup. A write run constructs a fresh plan and pins source fingerprints; it does not trust an earlier terminal preview.

Plan complete service-directory moves, including helper-only contents and colocated tests/assets. Rewrite resolvable TypeScript imports/re-exports/literal dynamic imports and JSON/tsconfig aliases with syntax-aware edits. Audit test imports, Drizzle schema paths, seed/migration and operation scripts, code-generation configuration, package scripts, and application documentation. Update unambiguous known literal references with format-aware editors; report computed or ambiguous references for manual remediation. Do not global-replace path-looking strings.

Refuse existing destinations even if byte-identical, touched tracked staged/unstaged changes, conflicting case/symlink shapes, unresolved affected references, and an identified running dev session. Preserve unrelated dirty files and do not run Git mutations. Untracked service contents can move only when included explicitly in the preview and snapshot; non-Git projects use filesystem snapshots and fingerprints. Recommend stopping all watchers because unknown external watchers cannot be conclusively detected.

Stage source/config changes in an isolated sibling workspace using the installed toolchain and dependency identity, without copying or activating persistent resources. Baseline and candidate checks compare logical contracts and mocked/offline deployment identities. Run applicable project check/typecheck and validate rewritten tooling references. No install or lockfile change is required for a layout-only migration. Publication is refused if required local validation cannot run.

Before publication, persist an owner-only recovery record under `.relkit/migrations/<id>/` with the exact touched edit set, original bytes/modes, before/after fingerprints, and operation status. Do not include environment files or credentials in the edit set or print backup contents. Recheck all source and destination preconditions, apply coordinated edits, then mark the receipt committed. The filesystem operation is not claimed to be cross-file atomic. Failure/interruption restores only transaction-owned changes; if another process changed a touched path, preserve it and retain actionable recovery records rather than overwrite it. Recovery records cover a crash between edits and survive until explicitly cleaned up.

Rollback validates every post-migration fingerprint and all restore destinations before mutation, restores only the recorded set, and leaves resources and later unrelated edits untouched. Conflicts block rollback. A grouped rerun is a no-op. Successful apply prints fresh check/preparation/dev steps; stale generated snapshots are rejected through their input fingerprints without deleting durable state.

Alternatives rejected: a global rename plus regex replacement is unsafe; silent dirty-file overwrite loses work; `git reset` cannot provide correct rollback for non-Git projects or unrelated edits.

### 7. Scaffolding and release coverage follow the capability table

Update create/add to consume shared layout results; keep generic selection separate from database/auth and middleware independent. Minimal remains one useful hello service/function. Apply fullstack changes inside its current backend root; leave frontend and wrapper orchestration intact. Maintain candidate tests for all template sources while keeping uncertified combinations unavailable publicly.

Rebuild packed templates and refresh affected exact-identity readiness evidence. Existing requirements remain: 20 fresh-installed starts and 20 unchanged restarts per offered tuple on the reference host, each strictly below 1,000 ms, timing literal `bun dev` through the complete correct public response. Retain every attempt; cold setup and edited-source fallback are separate. Fullstack probes backend `/hello`; Inspector/web readiness is independent. The default tuple blocks shipment if uncertified.

Alternative rejected: broadening the allow-list because grouped templates compile would conflate source correctness with public readiness support.

### 8. Acceptance matrix drives phase gates

| Area                          | Decisive evidence                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classification and boundaries | Flat/grouped/empty/invalid/mixed/duplicate/nested fixtures; case/traversal/symlink checks; aliases, type-only, re-exports, dynamic limits                                                                             |
| Identity and generation       | Paired logical projections, explicit/private IDs, default/named exports, context/client registries, actual provenance, source-only graph diff                                                                         |
| Existing capabilities         | Database transactions/lazy disposal; auth sessions; function validation; producer/receiver event ownership; job schedules/retries; realtime replay/revocation/presence; deterministic agents/tools/streams; resources |
| Security                      | Real server middleware and route protection, direct function/tool denial, channel partition and agent thread cross-user/tenant denial                                                                                 |
| Durable continuity            | Native accepted-work/version routing and thread recovery after source movement, no duplicate schedule/resource ownership                                                                                              |
| Development and Inspector     | Rename/add/delete, helpers/config/env/alias invalidation, stale snapshot rejection, clean/incremental parity, last-known-good and moved source navigation                                                             |
| Migration                     | Preview immutability, dirty/non-Git/conflict behavior, syntax-aware rewrites, injected failure/crash recovery, rollback conflict refusal, no-op rerun                                                                 |
| Distribution and docs         | Packed external create/add/migrate, printed commands, candidate fullstack backend, docs includes/links/examples, exact-identity readiness recertification                                                             |
| Deployment                    | Pure plan/Pulumi mocks show no logical replacements; cloud acceptance remains separately authorized                                                                                                                   |

Focused suites precede repository-wide gates. Real HTTP middleware cannot be certified by `createTestApplication`'s helper path that omits declared HTTP middleware. Mocked native durability is insufficient: use supported account-free native fixtures; mark unavailable required evidence blocked. Do not repair unrelated API/spec drift merely to update this layout.

### 9. Use-effect applies to every changed authored file

Use `/Users/mustafaelsayed/.codex/skills/use-effect/SKILL.md` as the implementation and review entry point, including its binding workflow/sources, implementation standards, code style/layout, and verification references at their required phases. Load its required global Effect prerequisite, repository-local Effect guidance, and code-simplification prerequisite; load services/errors, concurrency, lifecycle/durability, contracts/testing, TSDoc, and integration references when their responsibilities apply. Do not treat this summary as a replacement for reading the skill. Before selecting an Effect API or pattern, inspect its implementation, tests, and examples in read-only `repos/effect`, check applicable vendor instructions and installed/pinned compatibility, and record any fallback source gap. Reuse evidence for the same verified pattern.

Expand the existing impact inventory to every added, edited, and moved authored file, including supporting files outside the initial roots, hidden/ignored authored files, tests, type/schema companions, template sources, documentation snippets, and skills. Read every such file through EOF. Exclude generated output, dependencies, binaries, and vendor code explicitly; validate generated artifacts through their owning generators and behavior checks. Track file-level review disposition and meaningful evidence in the existing change evidence index rather than introducing a per-symbol ledger.

For internal effectful workflows, apply cohesive Services and service-owned construction, live/test Layers, correct E/R contracts, typed selective recovery, lazy execution, scoped resources/fibers, bounded coordination, and operation-level traces/metrics/structured logs. In this change that includes source/config I/O, compiler orchestration, watching, staged migration, receipts/publication/rollback, and CLI boundaries. Preserve defects/interruption and mixed causes, distinguish Layer acquisition failures from method failures, and prove cleanup and recovery under failure and cancellation. A tag around unchanged Promise orchestration or an Effect import does not establish compliance.

Apply the skill's stricter source rules to every new or edited authored source file: at most 200 formatted physical lines (also satisfies the repository's 250-line ceiling), function bodies below 50 code lines by the skill's definition, concrete opening overviews, complete applicable callable/error-member TSDoc, checked examples, precise types without authored `unknown` or evasions, and named type/schema companions. Measure after formatting and review substance, not comment/import presence. Use package/app-owned root tests with Vitest and `@effect/vitest` where relevant, deterministic Layers/clocks/synchronization, and real adapter evidence when a fake cannot establish the guarantee.

Applicability is explicit per file: a pure calculation can remain pure; a type/schema companion needs type/layout/documentation checks; React presentation retains React's lifecycle; Markdown/config/skill files need accurate guidance and checked snippets rather than runtime imports. Moved-only files are still read and reviewed; do not treat a rename or import-only edit as an automatic exemption. Preserve already-correct Effect code and do not introduce artificial services, wrappers, or unrelated features. These are responsibility-based dispositions, not blanket exclusions of tests/templates/UI.

RELKIT application `service.ts` is a public descriptor boundary, not an instruction to replace `defineService`, `defineDrizzleService`, or `defineBetterAuthService` with an Effect service. Public templates/examples continue to use supported plain TypeScript authoring APIs. Internal Effect service/type/schema organization must coexist with the enforced application filenames and identity-neutral migration. No new public Effect dependency or authoring requirement follows from this review gate.

Every phase closes only after reviewing its actual changed-file set against the applicable skill clauses, resolving findings, and rerunning invalidated checks. Reconcile the final changed-file set, including late fixes and untracked/ignored authored additions, with that review before completion. Missing required source evidence or checks remains a named blocker; this planning review does not certify future runtime implementation.

Alternative rejected: a single final checklist saying "uses Effect" can miss supporting files, late edits, typed failures, and resource ownership even when all imports look correct.

### 10. Skill guidance ships with the implemented layout

Audit repository-owned `.agents/skills/`, `.codex/skills/`, their references/examples/templates/scripts, `AGENTS.md`, and any skill/guidance copies delivered by application templates or packaging. Follow actual symlink/copy ownership and change the authoritative source; do not modify globally installed or third-party skills merely because they are available in the session. At minimum inspect `relkit-app`, `documentation-writer`, `relkit-deploy`, and `konsistent-config`, plus any other inventory hit that teaches application paths or creation/migration commands. Record justified no-change dispositions for generic guidance.

The current `relkit-app` skill explicitly teaches `src/<domain>/service.ts`, and `documentation-writer` refers generally to the current domain-first layout. Update affected guidance in the same implementation phase as examples/docs, after grouped behavior works and before completion. Teach grouped defaults, detection and preservation of valid flat apps, optional preview/write/rollback, specialized ownership, unchanged Routes/Platform, and the distinction between compiler rules and optional folders. Check advertised create/deploy commands against the installed capability table; do not teach uncertified tuples as available defaults. Historical migration examples may retain flat paths when clearly labeled.

Verify the whole affected skill, not only its entrypoint: relative links resolve, bundled examples/snippets compile or execute where applicable, and following skill instructions can create a supported grouped app, add to a flat app without mixing roots, and preview/apply/roll back a migration. Application-local agent guidance with moved literal paths belongs in the migration reference audit as well; never rewrite global skills or infer a code migration from arbitrary prose.

Alternative rejected: changing skills now to describe unimplemented support, or leaving only a generic "update agent guidance" task, risks teaching behavior that does not match the available framework.

## Risks / Trade-offs

- Hidden path assumptions → complete the phase-1 impact inventory before template moves; pair logical and runtime evidence across both layouts.
- Identity normalization erases real hierarchy → strip only the selected grouping segment and retain private/default-export/error regression cases.
- Alias or helper bypass → resolve with effective project options and validate source edges, including type-only and re-export chains.
- Dynamic JavaScript exceeds static analysis → emit explicit limit warnings and block uncertain migration rewrites; do not claim complete enforcement.
- File moves race watchers or user edits → stop development, fingerprint inputs, journal publication, and refuse conflicting recovery.
- Build hashes change while accepted work remains → retain immutable old build ownership and prove native recovery without renaming durable IDs.
- Template changes stale certification → refresh packed exact-identity evidence; preserve rejection of uncertified tuples.
- Existing flat support adds a long-lived compatibility branch → centralize interpretation and retain paired tests; removal requires a separate announced change.
- Skill instructions drift after implementation → audit entrypoints and supporting assets and run grouped/flat/migration instruction acceptance before completion.
- Generic Effect guidance changes public application contracts → apply it by file responsibility, preserve descriptor authoring APIs, and require a complete per-file review rather than mechanical imports.

## Migration Plan

1. Inventory assumptions and capture flat baselines, then implement/test shared classification before changing any templates.
2. Update compiler ownership/identity/boundaries and dependency invalidation; verify capability, runtime, and state parity.
3. Implement preview/write/rollback and its failure matrix, then update create/add/templates, examples, Inspector navigation, current documentation, and affected repository skills and supporting assets together.
4. Complete packed verification and affected readiness certification; keep unavailable provider/cloud outcomes explicit. Sync/archive specs only through the separately requested OpenSpec lifecycle.
5. Ship dual-layout support with grouped generation by default. Existing applications remain flat until their owner runs migration. No sunset is part of this change.

Application rollback uses the guarded receipt or a reviewed source-only version-control restore; it never restores or deletes live resources. Framework rollback before release restores the scoped implementation diff; after release, keep applications on a version that supports their selected layout or roll their source back first. Never publish an older compiler against a grouped application without that source compatibility step.
