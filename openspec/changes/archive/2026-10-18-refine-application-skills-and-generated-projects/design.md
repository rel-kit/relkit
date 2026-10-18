# Design

## Context

See proposal.md for motivation. Implementation is authorized for GPT-6.1 Sol. The final user decision is to complete the change while keeping the existing Drizzle patch as-is.

The inspected branch has these relevant behaviors:

- The shipped application skill already explains source placement, installed-CLI discovery, add commands, and focused verification. It does not yet contain the requested task-classification and onboarding workflow. Skill copies exist in minimal, api, agent, fullstack, and tasks templates.
- Minimal's ignore file lists individual .relkit subdirectories rather than the complete directory.
- Database rendering creates a service-owned schema but a root drizzle.config.ts with output ./drizzle, adds /drizzle/ to ignores, and copies scripts/migrate.ts for SQLite. SQLite uses drizzle-orm/bun-sqlite/migrator; PostgreSQL/MySQL use drizzle-kit migrate.
- Generator dependency-patches.ts reads a hash-verified bundled repair; creation and add planning propagate that repair into applications. The workspace pins drizzle-orm 1.0.0-rc.5-169397b, drizzle-kit 1.0.0-rc.5-ab785fc, and Effect 4.0.1. The patch repairs both Effect SQL import paths and strict optional-property declarations.
- scripts/build-catalog.ts unconditionally reconstructs the Drizzle patch registration and reads the patch bytes. scripts/sync-release.ts embeds that catalog into CLI, generator, and Effect MQ package manifests. Deleting the patch or editing generated manifests alone will fail or be undone by synchronization.
- The installed ORM migrator expects timestamped migration directories and explicitly rejects the older meta/_journal.json format. A dependency change must prove history-format compatibility, not just installation or fresh schema creation.
- tests/generator/sqlite-app-tooling.test.ts already verifies SQLite auth migrations and repeat runs, but links workspace dependencies and a version-specific Bun store path. It is useful focused coverage, not standalone consumer proof.
- The main cli-scaffolding spec requires portable transactional patch distribution. This requirement remains applicable; the current Drizzle repair and pins are preserved unchanged.
- Root guidance and current specs retain existing flat-layout support and layout-migration behavior. This change does not remove those APIs or retrofit them with database-history upgrades.

Recheck these observations when implementation starts. The separate release-readiness work can advance independently; use current certification machinery without changing its thresholds or historical reports.

## Goals / Non-Goals

**Goals:** Give the implementing agent explicit workflow, ownership, compatibility-proof, and acceptance boundaries. Keep migration source versioned while sharing reusable execution inside RELKIT. Update experimental samples directly.

**Non-Goals:** Legacy-app upgrade commands, compatibility shims, production rollout, database resets, histories per business service, new database dialects, new public Effect authoring requirements, frontend implementation, forced exposure of tables, global skill edits, and new creation certification tuples.

## Decisions

### 1. Extend the existing skill rather than install a second workflow

Add a short intent-driven entry workflow before artifact creation and expand the existing verification section. Keep detailed examples in the current relevant references. Synchronize the maintained template copies and affected repository-owned relkit-app guidance; record unaffected references rather than rewriting unrelated skills.

Feature planning, bug reproduction/diagnosis, and discussion-only behavior share the same verification and completion rules. For mixed requests, apply the appropriate rule to each work item. Explicit implementation requests authorize proceeding after the plan; unresolved material choices are the only reason for additional questions.

Database/auth onboarding belongs to the application agent before invoking the CLI. It does not add create-command flags, alter headless database defaults, or duplicate the CLI's existing interactive confirmation. An explicit no-database choice is valid; if requested authentication needs persistence, resolve that conflict before scaffolding rather than silently adding a database.

For optional modules, explain the concrete benefit and obtain a selection only when the capability was not requested. Check installed help/types for actual APIs. Preserve explicitly requested fullstack work and the framework inspector; backend-only guidance concerns unsolicited application frontend work.

Alternative rejected: a new independent checklist or mandatory approval after every plan, which would duplicate existing guidance and delay already-authorized work.

### 2. Make migration source ownership explicit

For new grouped applications, set migration output to src/services/database/migrations, adjacent to service.ts and schema/. Derive it from the selected database service directory rather than hard-coding a second service root; this also avoids breaking the existing layout-aware renderer. Fullstack paths are relative to its actual backend root.

Keep root drizzle.config.ts as explicit user-owned configuration, including schema, output, dialect, and connection settings. Preserve its current missing-configuration checks. Keep db:generate invoking the installed Drizzle generator and direct its output through that configuration. Do not generate empty migration metadata or hand-author Drizzle snapshots.

Use .relkit/ as the template ignore rule, preserve secret and database-file ignores, and stop emitting /drizzle/ as a migration-history ignore. Test final generated ignore behavior, including required metadata, rather than only comparing template strings.

Alternative rejected: putting migrations under ignored .relkit or splitting history by users/orders services. Both obscure the reproducible history of the shared database. [Drizzle configuration](https://orm.drizzle.team/docs/drizzle-config-file) supports an explicit migration output directory.

### 3. Centralize execution behind an installed command

Add an installed CLI entrypoint `relkit db migrate --config <path>`. Generate `"db:migrate": "relkit db migrate"`; retain `"db:generate": "bun --bun drizzle-kit generate"`. The explicit invocation authorizes applying pending SQL without another prompt. Keep this separate from `relkit migrate layout`, and wire the command through the existing parser, dispatcher, help/completion metadata, and generated reference pipeline.

The command contract is:

| Input or behavior | Decision |
| --- | --- |
| Working directory | Run from the application root containing package.json and relkit.config.ts; a fullstack app uses its existing backend root. Do not search for another project or start the application. |
| Configuration | Default to drizzle.config.ts. Resolve a relative --config path against the application root and accept an absolute path. Configuration in a nested directory does not change the base for out or relative database paths. |
| Database target | The loaded config's dialect and dbCredentials are authoritative. The generated config reads DATABASE_PATH or DATABASE_URL, but the runner must not independently reread those variables and override the selected config. |
| History and log | Resolve config.out against the application root; pass configured migration-table/schema options through where the selected dialect supports them. Do not hard-code ./drizzle or reset the applied log. |
| Environment | Preserve the generated Bun command's standard environment/dotenv behavior and inherited variable precedence. Never load .env.example, infer credentials from RELKIT_ENV, or read another checkout's dotenv files. Test generate and migrate with the same environment. |
| Preflight | Validate config shape, supported dialect, persistent target, required installed tooling, and readable compatible history before opening the target database. Missing history reports the db:generate next step; do not create an empty history or silently fall back to the old path. |
| Output | Use the existing reporter envelope. In --json mode emit exactly one success/failure object, with command, dialect and config/history paths on success; never expose connection strings, config contents, or invented applied-migration counts. Config/driver/tool output must not corrupt stdout. |
| Exit and lifecycle | Exit 0 only after migration succeeds and owned cleanup completes; use 2 for usage/configuration errors, 1 for operational failures, and 130 for interruption. Do not automatically retry failed SQL or promise rollback of dialect-specific partial DDL. |

Implement a thin CLI adapter and a finite worker packaged in @relkit/cli's dist. The parent owns invocation/cancellation and captures worker output through existing subprocess conventions; the worker owns loading user configuration and migration dependencies, connections, and any delegated Drizzle child. This keeps user-config output away from JSON stdout and lets cancellation reach synchronous SQLite work. Keep implementation internal: no new public TypeScript migration API or copied application runner.

Resolve optional ORM/Kit modules and executables from the consumer application's dependency graph, lazily after db migrate is selected. Do not add eager Drizzle imports or mandatory database packages to the base CLI/minimal app. CLI help, no-database create/check/dev, and unrelated commands must work without ORM/Kit installed. Missing tooling should identify the package and installation step rather than download it implicitly. Include the worker in package listings and prove its relative resource paths survive packing.

For SQLite, use the authoritative config target with the current Bun-native behavior: persistent file, parent-directory preparation after preflight, foreign keys enabled, the existing 5000 ms busy timeout, and the matching consumer ORM's native migrator. Map the config output and supported log options explicitly to the migrator API. Close the connection on success or failure; a native failure result must not be interpreted as success.

For PostgreSQL/MySQL, invoke the project's installed drizzle-kit under Bun with the selected config, application-root cwd, and the same effective environment, using argument arrays and no implicit package download. Delegated Drizzle execution retains its normal configuration loader; require configuration to be deterministic across wrapper and tool loading, as generated configs are. Capture child output, present bounded secret-safe diagnostics, and await owned cleanup before reporting a result. Do not add another migration engine.

Alternative rejected: retaining a copied scripts/migrate.ts in every app or sending Bun SQLite through a Node-only driver. A shared command fixes execution in one place while keeping configuration and SQL visible to the app author.

### 4. Preserve the required explicit portable repair

The user explicitly directed that the Drizzle patch stay as-is. Preserve its bytes, current ORM/Kit/Effect pins, catalog registration/hashes, lockfiles and distribution/rollback machinery. The earlier all-hunk audit and rejected upstream tuples remain historical compatibility evidence; no new upstream search or patch removal is required for this change.

Verify strict declarations and database/auth behavior with the current explicit repair. Independent consumers obtain the repair from the actual candidate generator archive and its hash-verified relative registration, never from a workspace's already patched node_modules. No additional suppression, skipLibCheck workaround, hidden postinstall edit, downgrade or alternate repair is permitted.

Generate/apply current-version history in isolated fixtures. Require unchanged history and applied logs to remain usable, no-op reruns, a subsequent generated migration and the same final schema on fresh databases. Do not run drizzle-kit up, rewrite snapshots, rebaseline identifiers or reset state to manufacture success.

Run release synchronization/check mode and existing repair-distribution, collision and transaction tests. They must preserve the required repair and unrelated registrations at unchanged package versions. Do not replace these tests with patch-free expectations or remove patch assets.

The explicit packaged repair is the only dependency modification in standalone acceptance. Root compiler settings and public authoring contracts remain unchanged.

### 5. Update samples directly during experimental development

During implementation, add a concise root AGENTS.md note stating that RELKIT is experimental, interfaces may change, and current consumers are repository samples. This authorizes direct sample updates within the task; it does not authorize deleting data or unrelated changes.

Inventory relevant sample histories before changing paths. Move actual SQL and required metadata without rewriting contents or IDs, update config/scripts, and compare pre/post hashes and applied-log rows. If no existing sample has persisted history, construct a disposable acceptance fixture with applied migrations; do not invent evidence about a sample database. Do not reset, seed, or migrate unrelated user databases.

No legacy upgrade command, fallback to the old root history, or dual-history compatibility layer is added. Existing independent flat-to-grouped layout migration remains outside this cleanup.

### 6. Verify guidance behavior and delivered artifacts separately

Use structural tests for maintained skill parity, reference links, packed inclusion, generated paths, script targets, and ignore behavior. Supplement them with recorded scenario evaluations of the actual shipped skill; keyword assertions alone do not establish agent behavior. Use the existing available agent evaluation path with disposable fixtures and a deterministic local backend bug; record prompts, model/version, relevant responses/file changes, and a pass/fail rubric. Do not build a new evaluation platform or fabricate transcripts; unavailable live evaluation is a reported blocker to behavior acceptance.

Minimum guidance scenarios are: unspecified new app (one combined database/auth question before writes); fully specified app (no repeated onboarding); explicit no-database app (no database added); requested auth conflicting with no persistence (resolve before writes); unrelated bug (no onboarding, reproduce and replay); feature (short plan then authorized edits); discussion (zero file changes); mixed intent (separate read-only and authorized portions); unrequested realtime (benefit and selection before adding); requested realtime (only unresolved provider questions); users/orders API (separate validated/authorized routes, no frontend); infrastructure/auth handler (no blanket table exposure, intentional handler retained); explicit fullstack/existing frontend (preserved); and blocked verification (no full-success claim).

Use targeted generator/CLI/package tests first, extending the existing sqlite-app-tooling and add-transaction tests plus sync-release and release-check-listing coverage. Replace the hard-coded Drizzle store-version fixture with catalog-derived resolution. Workspace-linked fixtures remain useful local tests but cannot count as packed proof.

For packed acceptance, use the repository's existing candidate package/registry harness to resolve the complete affected RELKIT dependency graph from candidate artifacts, at unchanged package versions. Generate independent consumers outside the monorepo, with fresh dependency installation, no workspace/source symlinks, no inherited workspace repairs and no accidental fallback to an older published CLI/generator. Database consumers use the current explicit patch supplied by candidate assets. Record resolved package versions/hashes and generated manifests. Cover both create entrypoints, default no-database creation, database addition, auth addition without a database, and auth addition reusing an existing database. Prove check/typecheck/test/build/start and actual database/auth HTTP behavior.

Run SQLite acceptance locally; PostgreSQL and MySQL use isolated test databases through existing local infrastructure, one at a time. For each dialect, cover database-only and auth scaffolding, current-version applied history, candidate fresh history, a second migration, rerun idempotency, and configuration failures. Assert persisted rows, schema and applied-log entries, not just command exit or HTTP 200. Auth acceptance includes signup/sign-in, session cookies, and both denied and allowed access to an explicitly protected application route; the auth protocol handler alone is not authorization proof. Unavailable local infrastructure is a reported verification blocker, not permission to claim support from rendering alone.

Check every maintained template's files, guidance and ignore behavior; use the existing internal candidate harness for templates not publicly certified. Public create smoke tests must use currently admitted tuples, never bypass the gate or promote fullstack/tasks merely to test file output. Template changes require fresh identities and current packed/readiness evidence. Functional readiness and host performance stay distinct according to the current branch. Do not broaden certified tuples to make this change appear complete.

Keep implementation evidence in this change's evidence directory: the historical compatibility matrix, guidance-evaluation results and a verification report mapping each current delta requirement to tasks and exact evidence. Failed checks require investigation and repair; resource pressure requires waiting or reducing the workload while continuing authorized work. Do not claim a missing runtime or compatibility check passed.

## Risks / Trade-offs

- Current upstream declarations still need the repair → retain the exact existing patch and portable distribution, as directed by the user; removal is outside this change.
- Config loading or module resolution differs in packed consumers → exercise the installed command outside the monorepo with no source checkout or hoisted modules.
- A path move changes applied-migration behavior → compare SQL/metadata hashes and database log rows before and after; prove no-op reruns and later schema evolution. The [applied migration log](https://orm.drizzle.team/docs/drizzle-kit-migrate) is separate database state.
- Agent outputs vary despite correct skill text → preserve scenario transcripts and rubrics; separate structural tests from observed behavior.
- Heavy builds/databases reduce Mac responsiveness → inspect CPU/load/memory/pressure first, run one heavy task with one worker and bounded resources, monitor pressure, and stop only owned work when constrained.
- Concurrent readiness changes invalidate evidence → re-read the current certification contract and regenerate candidate evidence without editing the separate change or relabeling older reports.

## Migration Plan

1. Preserve the required Drizzle patch and dependency pins, and verify their portable strict acceptance with current candidate assets.
2. Add shared execution, update generated migration configuration/scripts/ignores, and align repository samples without resetting histories.
3. Synchronize skills, references, contributor guidance, and generated command documentation with the implemented behavior.
4. Run focused and packed acceptance, regenerate affected certification evidence, and record remaining blockers before declaring tasks complete.

There is no deployment or automatic database migration in this change. Recovery from a failed sample path update restores its owned files/configuration; it must not reverse already-applied SQL or discard database state. Clean up all owned servers, subprocesses, browsers, and test infrastructure before completion.
