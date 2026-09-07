## Context

See `proposal.md` for motivation. The Effect command tree already owns parsing, help, completion, reporters, and exit handling, while `create-relkit` already owns template staging and publication. Compiler discovery already parses canonical RELKIT factories and route files, provider packages already expose serializable authoring descriptors, and durable filesystem event/job implementations already exist beneath the local provider runtime. The design must preserve those boundaries, strict TypeScript, source-file size limits, user-owned dirty changes, and all existing wire versions.

## Goals / Non-Goals

**Goals:**

- Put create and add option resolution, planning, rendering, application, rollback, and result types in `create-relkit` so both binaries use one implementation.
- Keep interaction injectable and outside the deterministic planning core.
- Limit source mutation to validated canonical object literals and byte-preserving insertions.
- Make one request, including a service bundle or auth/database chain, one recoverable transaction.
- Reuse existing compiler discovery and provider runtime implementations rather than building parallel parsers or runtimes.

**Non-Goals:**

- Replacing Effect CLI, introducing a renderer/framework abstraction, or adding a plugin registry.
- Supporting package managers, database clients, providers, or source shapes outside the explicit contract.
- Running migrations, Docker, models, cloud provisioning, generated tests, or secret generation.
- Changing graph, manifest, integration, or provider protocol formats.

## Decisions

### Keep Effect CLI as the command authority

The root command gains an `add` subtree and delegates parsed invocations to the shared scaffolding API. The no-command branch invokes an interactive action resolver only when terminal capability checks pass. Existing Effect help and completion generation therefore see every command and flag without a second parser. Clack supplies prompts and finite-operation spinners through a small injected prompt-driver shape; long-running commands keep streaming their current logs.

Alternatives considered: Ink would add a React renderer and duplicate lifecycle concerns; oclif would replace rather than enhance the command framework; a hand-written menu would duplicate validation and cancellation behavior.

### Extend `create-relkit` into a deterministic scaffolding engine

The package exposes discriminated requests and results plus three phases: inspect/resolve, plan, and apply. Renderers are selected by `AddKind`, but share normalization, discovery, edit operations, conflicts, transaction application, and result formatting. Creation stages a template as it does today, runs optional additions against that staging directory, then publishes once. Headless chained adds call the same public API against an existing destination.

Alternatives considered: a new package would only move existing ownership and add another release boundary; placing generation in CLI would make `create-relkit` diverge again.

### Represent plans as complete file operations

A `ScaffoldPlan` contains immutable create/update operations, package and script edits, structured warnings, and next steps. Planning reads all source and configuration inputs, validates every target and relationship, and rejects all conflicts before application. Files are rendered in memory; JSON serialization and human previews consume the same plan facts.

Updates use TypeScript AST nodes only to prove that required factories and object literals are canonical and to obtain insertion offsets. Small text insertions preserve all untouched bytes. Dynamic values, spreads, computed properties, duplicate exports, and multiple plausible targets fail with `unsupported-source-shape` rather than being reprinted.

Alternatives considered: TypeScript printer output would reformat user code; regular expressions alone cannot establish safe edit boundaries; a general refactoring engine is unnecessary for the supported canonical shapes.

### Apply one snapshot-backed transaction

Before the first mutation, the applier snapshots bytes and modes for every existing touched path and `bun.lock`, and records every path that does not exist. Writes use sibling temporary files and atomic renames. It merges `package.json` once, runs `bun install` once when required, then runs a development `relkit check`. Any failure restores prior bytes/modes and removes only transaction-created paths. Unrelated paths are never snapshotted or touched.

With `--no-install`, the applier checks package availability. It validates normally when dependencies resolve and otherwise reports the exact install/check commands with a skipped verification status. Cancellation occurs before the applier and needs no rollback.

Alternatives considered: requiring a clean worktree would reject legitimate use; Git-based rollback would mutate unrelated user state; per-artifact installs make bundles slower and harder to recover.

### Discover through compiler facts, edit through canonical source models

The inspector consumes compiler route parsing, source prefilter facts, package metadata, and canonical `defineService`, `defineApp`, and imported `defineEnv` object literals. Compiler facts gain only the `.asTool()` recognition needed to associate derived tools with callable functions. The inverse route helper lives next to route parsing so forward and reverse conventions share one implementation and tests.

### Generate first-party source from one version catalog

Artifact renderers use one catalog for dependency versions, imports, factory calls, environment names, and first-party source options. A repository test compares catalog versions with owning manifests. Existing compatible profiles win; otherwise full bundles use local filesystem events/jobs, Docker Redis/MinIO, and the current OpenAI model default. AWS sources require an existing AWS/Pulumi deployment and scaffolding never executes provider side effects.

### Publish local event/job adapters from existing runtimes

`@relkit/local` adds pure authoring functions with integration metadata and a runtime registration module that delegates to the existing durable local event/job constructors. The job adapter advertises queue capability only. Existing local-service exports remain unchanged.

### Treat database and auth as singleton composite renderers

Database planning owns its service, dialect schema, Drizzle config, environment entry, dependencies, ignore rule, and scripts. Auth planning first discovers the singleton database; if absent it composes database operations in the same plan, substituting Better Auth tables for `items`. Each dialect renderer is explicit because driver imports and column types differ. The route mount is generated using the same route inversion and collision checks as `add route`.

## Risks / Trade-offs

- [Canonical edits reject creative but valid TypeScript] → Fail before writes with the exact unsupported construct and document the canonical shape; expand support only from real examples.
- [A transaction cannot reverse external installer caches] → Scope rollback to project files and lockfile, run installation once, and state this boundary in failures.
- [The command matrix can drift from help and docs] → Generate both from the Effect tree/shared help model and assert every `AddKind` is represented.
- [Provider package versions can drift] → Keep one catalog and compare it to workspace manifests in a focused test.
- [Full bundles combine many relationships] → Render and verify the bundle as one deterministic fixture and assert its normalized graph rather than testing isolated snippets only.
- [Interactive tests can hang] → Inject the prompt driver and terminal capability facts; never open real prompts in unit or packed automation tests.

## Migration Plan

1. Add delta specifications and introduce compiler/local-provider primitives with focused tests.
2. Add shared request, discovery, planning, rendering, and transaction APIs without changing current creation callers.
3. Route both create entrypoints through the resolver and add the Effect `add` tree plus Clack interaction/status handling.
4. Add template matrices, failure injection, packed acceptance, and generated documentation.
5. Run focused suites, repository typecheck/guardrails, then full local verification. Existing projects need no migration; unsupported source shapes receive an actionable error and can be made canonical manually.

Rollback is a normal source revert because no persisted protocol or user-data migration is introduced. Individual scaffold operations perform their own filesystem rollback before returning failure.
