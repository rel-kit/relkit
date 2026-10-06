## Context

See proposal.md for motivation. The baseline contains 57 generator and 150 CLI authored TS files. CLI already uses Effect's command parser but its workflows and emitted runtime largely use Promise-based orchestration. The workspace pins Effect rc.115 in many manifests; release and scaffold tooling assume inline dependency versions.

## Goals / Non-Goals

**Goals:** cohesive testable services, honest resource ownership and cancellation, stable v4 compatibility, one shared dependency definition, shorter creation, and portable verified publication.

**Non-Goals:** a broad architecture rewrite of other packages, cloud deployment, generated application Effect imports, new CLI recipe/confirmation flags, or fabricated use of APIs without a domain need.

## Decisions

### Stable dependency foundation before parallel refactors

Use Effect and existing companions at 4.0.1, Bun 1.3.10 top-level catalogs, and a named peer catalog. Preserve first-party workspace protocols. Align only existing differing shared pins to Next 16.3.6 and React types 19.2.18/19.2.7. Independent package upgrades were rejected because they could produce incompatible Context identities and inconsistent generated manifests.

One strict resolver serves repository tooling. Release synchronization derives portable package-owned metadata and concrete template manifests; published runtime never searches the original repository. Release staging carries catalogs, overrides, and patches; smoke registry metadata uses packed manifests rather than source manifests.

### Portable declaration compatibility

Drizzle's current and newer RC declarations use the removed unstable SqlError path, although runtime JS does not. Keep its current pin and ship one declaration-only repair; upgrading to another broken RC or weakening type guards is unsuitable. Generate the patch descriptor/key/hash from the catalog. Package the asset in create-relkit/dist, materialize a versioned patches/ file and patchedDependencies entry before install, and merge only compatible existing content. Repair-only add plans require install and bun.lock snapshot. Roll back manifest/asset/lock together. Manual native consumers need explicit app-level patch instructions; dependencies do not inherit workspace patches.

### Domain services and ownership

Generator domains cover discovery, planning, transactions, generation, prompts, filesystem, and subprocess adapters. Discovery uses AST inspection without executing user projects. Each request owns its planning Ref; independent reads are bounded, writes ordered, per-file publication atomic, and multi-file failure handled by snapshot rollback. Project creation validates a sibling stage before final rename.

CLI domains cover command/presentation, project operations, clients/jobs, local services, deployment, and dev/runtime. Session and generation scopes own workers, listeners, children, output draining, and shutdown. Refs protect atomic state/version/identity changes; Deferred models readiness/shutdown; scoped fibers and queues/streams carry background work. Preserve OS process-group cancellation for isolated compiler work. Never let a superseded generation activate or close the newer owner; keep the old generation serving until the candidate is ready.

Use a bounded success cache only for existing dev-session recipe/import reuse, keyed by project/dependency/config epoch. Explicit session ownership makes RcMap unnecessary unless actual shared ownership appears. Do not cache mutating compilation/activation/RPC/deployment work. Stable cache abandonment and zero failure TTL need concurrency evidence.

Service methods use named Effect.fn, Schema-derived validation, Schema.TaggedError failures, live/test Layers, supplied observability, and narrow service requirements. Public Promise/sync adapters and existing error/result contracts remain supported. Shared execution observation gains cli/generator domains and preserves original causes; adapters do not count twice. Configure redacted logger sinks at binary/runtime edges and keep JSON stdout clean.

### Short shared creation flow

Keep Clack. Ask for a missing name and final confirmation only. Defaults are minimal; cloud/deploy/jobs none; install/Git/examples enabled; destination derived from name. Explicit supported flags retain advanced choices. Keep the full add interaction and post-add Docker startup consent. The package index becomes a pure barrel with a distinct executable entry.

### Independent review and acceptance

Use one worktree from captured HEAD. Finish the shared foundation before two package authors work in parallel with exclusive ownership. Each phase ends with independent full-file review of every changed TS file. Audit all authored files, including hidden/ignored files, and record retained pure helpers. Generated workflows are reviewed through emitters and tested through real bundles.

Use deterministic Effect tests plus existing native process/browser/packed suites. Verify missing-service and SQL error typing negatively. Fresh registry installs establish patch portability. Replay the regression demo through RELKIT_ROOT using temporary candidate links; snapshot and restore manifests, locks, link registrations, and historical evidence. Fresh Luna calls are authorized but require a securely supplied environment key.

## Risks / Trade-offs

- Stable API and declaration differences → inspect installed 4.0.1, available read-only vendor source, and version-matched upstream tests; gate the upgrade before package lanes.
- Cancellation cannot terminate arbitrary native work → propagate supported AbortSignals, preserve process-group termination, await release before rollback.
- Catalog tokens leak through generated metadata → resolve at serialization boundaries and inspect actual packed/standalone consumers.
- Existing demo findings can mask regressions → record baseline and candidate separately; never overwrite historical evidence or report failed checks as passed.
- Concurrent authors overlap shared files → coordinator owns manifests, shared contracts, and integration; resolve interface changes explicitly.

## Migration Plan

Create/validate artifacts and baselines; install and verify the catalog/stable cohort; refactor package domains in parallel; integrate emitted runtime and observation; perform independent reviews and full acceptance; synchronize only the verified task delta as unstaged changes into the original checkout. Preserve user changes and record actual passed, failed, unavailable, and blocked checks.
