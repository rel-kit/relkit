## MODIFIED Requirements

### Requirement: Domain-first services have layered release evidence

Release verification SHALL cover service identity and typing, flat and grouped domain discovery and boundaries, graph/manifest contracts, Drizzle and Better Auth lifecycle, route protection order, Inspector presentation, generated templates, canonical examples, documentation, and migration diagnostics without cloud credentials or paid calls. Previously valid flat applications SHALL remain passing compatibility fixtures; removed layer-first and removed authoring patterns SHALL remain rejection fixtures.

#### Scenario: Breaking release is verified

- **WHEN** focused and full repository verification run against migrated source and legacy fixtures
- **THEN** valid flat and grouped domain applications pass, removed legacy patterns fail with actionable diagnostics, runtime resources drain safely, and generated artifacts contain no live values or secrets

## ADDED Requirements

### Requirement: Grouped layout compatibility has executable paired evidence

Acceptance SHALL compare equivalent flat/grouped fixtures across all supported descriptor kinds, explicit and inferred public/private identities, declared errors, generated context and HTTP/OpenAPI/client/event/job/channel/agent contracts, service dependencies, exposure, bindings, and deployment identities. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Source provenance and executable/build hashes SHALL be allowed to change; whole-graph byte equality across a source move SHALL NOT replace logical compatibility assertions. Within each final source state, deterministic and clean/incremental equality SHALL still hold. Offline deployment planning SHALL show no logical resource replacement caused solely by the grouping directory.

#### Scenario: Source-only move is compared

- **WHEN** paired fixtures differ only by service-directory movement and corresponding imports
- **THEN** logical contracts and durable/resource identities match, graph diff reports the source-only change without a breaking logical/deployment classification, and physical source locations remain correct

#### Scenario: Structural and import rejection matrix runs

- **WHEN** fixtures cover empty, flat, grouped, mixed, missing, duplicate, nested, case-colliding, traversal, and symlink shapes plus relative/alias/type-only/re-export/literal-dynamic imports
- **THEN** supported cases agree across compiler and tooling, forbidden cases fail consistently, and computed dynamic cases explicitly report analysis limits

### Requirement: Runtime and security behavior survives service movement

Grouped-layout acceptance SHALL execute representative database/auth, functions, events/tasks/jobs, realtime, agents/tools, cache/buckets, and HTTP/streaming flows using existing public configuration. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

It SHALL verify lazy acquisition, transactions and disposal, auth mounts/sessions/protection, function validation and errors, receiver-owned subscribers, durable IDs/bindings/schedules/retries, channel exposure/partitions/replay/presence, agent models/tools/streams/thread ownership, resource ownership, and stream completion/cancellation. Security evidence SHALL include cross-user and cross-tenant denial via HTTP, direct functions, tools, and channels. HTTP middleware policies SHALL be tested through the real server pipeline rather than a helper that omits declared middleware.

#### Scenario: Authorization parity is exercised

- **WHEN** paired applications process permitted and forbidden requests through their real HTTP server and direct/tool/channel paths
- **THEN** the same requests succeed or fail for the same policy reasons, and no internal channel, job, or agent becomes externally accessible because it moved

#### Scenario: Accepted work and threads survive the move

- **WHEN** work or agent state is persisted before migration and recovered afterward under supported native providers
- **THEN** accepted work remains pinned and reachable under its original IDs, thread ownership remains enforced, schedules are not duplicated, and incompatible executable cohorts are rejected

### Requirement: Migration and development failure paths are demonstrated

Acceptance SHALL prove nonmutating previews, safe resolvable rewrites, unresolved-path reporting, destination/dirty-file/concurrent-edit conflicts, non-Git behavior, staged validation, injected publication/validation failures, restoration, receipt rollback, and no-op reruns. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

It SHALL include tooling paths, tests, Drizzle schema configuration, seed/migration scripts, code-generation configuration, and documentation references. Watch/cache evidence SHALL cover moves, boundary changes, helper/config/environment edits, stale snapshots, last-known-good behavior, and preserved state/journals/observability.

#### Scenario: Migration fails after publication begins

- **WHEN** a failure is injected after the first owned source edit
- **THEN** recorded before/after evidence proves restoration of touched bytes and modes, preservation of unrelated files and persistent resources, and an actionable recovery record if automatic restoration cannot finish

#### Scenario: Incremental and clean builds are compared

- **WHEN** each relevant layout or imported support-file mutation is processed by watch and clean compilation
- **THEN** outputs and diagnostics agree for the same final source state and invalid candidates never replace the serving generation

### Requirement: Grouped distribution refreshes affected certification

Acceptance SHALL run packed CLI/generator and migrated flat applications outside the monorepo, verify documented install/check/typecheck/test/build/start/dev flows, and refresh readiness evidence invalidated by package, template, or tool changes. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Maintained minimal/API/agent/fullstack template sources SHALL receive candidate coverage, while public creation SHALL remain limited to currently certified tuples. Every offered tuple SHALL retain the existing reference-host 20 fresh and 20 restart measurements, every start strictly below 1,000 ms from literal `bun dev` to the correct public response, with all attempts retained. Unavailable required evidence SHALL be recorded as blocked or not run, never passed; no tuple SHALL be promoted using source inspection or snapshots alone.

#### Scenario: Template digest changes

- **WHEN** grouped template changes invalidate existing creation evidence
- **THEN** affected certification is refreshed for the exact package/tool/template identity before shipment and the default minimal gate remains mandatory

#### Scenario: Fullstack candidate is valid but uncertified

- **WHEN** candidate fullstack tests pass without current reference-host readiness certification
- **THEN** backend layout correctness is recorded separately and public creation continues rejecting the uncertified tuple

### Requirement: Every changed authored file receives use-effect review

Each implementation phase and final acceptance SHALL account for every added, edited, or moved authored file and review it through EOF against the complete `use-effect` skill, its binding references and prerequisites, and applicable repository instructions. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Coverage SHALL include supporting files outside the primary implementation roots, hidden/ignored authored files, tests, type/schema companions, template source, documentation snippets, and skill guidance. Generated output, dependencies, binaries, and vendor code SHALL be explicitly excluded from authored-source review and validated through their relevant generation/behavior checks. Selected Effect patterns SHALL have implementation/test/example evidence from the read-only reference checkout and installed-version compatibility checks, with unavailable evidence disclosed.

Applicable runtime acceptance SHALL verify real service composition, live/test substitutability, E/R contracts, typed recovery, defects/interruption, lifetime ownership, concurrency bounds, and standalone instrumentation. Applicable source review SHALL enforce the skill's formatted 200-physical-line file limit, function bodies below 50 code lines, precise types, headers, TSDoc, checked examples, and companion placement. Review SHALL record responsibility-based treatment of pure helpers, public descriptors, UI, and non-runtime files without manufacturing Effect imports or changing public authoring APIs. Findings SHALL be resolved and invalidated checks rerun before phase or final completion.

#### Scenario: A supporting file changes late

- **WHEN** a fix adds, edits, or moves an authored file after its phase review
- **THEN** final acceptance includes the new file state in review and reruns affected checks instead of relying on earlier approval of different content

#### Scenario: Effect imports exist but behavior is unverified

- **WHEN** a changed workflow imports Effect or declares a Service but lacks applicable E/R, cleanup, recovery, or instrumentation evidence
- **THEN** its review remains incomplete and import presence or a completed planning checkbox cannot establish compliance

#### Scenario: A file requires no runtime Effect implementation

- **WHEN** a reviewed file is a pure leaf, public RELKIT descriptor, type/schema companion, React presentation module, or Markdown/skill guidance
- **THEN** review records the applicable checks and preserved boundary without inventing unrelated runtime abstractions or exempting its actual source/type/documentation obligations

### Requirement: Skill update acceptance is part of layout completion

Acceptance SHALL reconcile the repository skill/agent-guidance inventory with updated or justified unchanged files, validate affected frontmatter and links, check executable snippets, and exercise applicable grouped creation, flat addition, and migration/rollback instructions. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Stale unlabeled layout advice, unsupported advertised create options, unresolved references, or an omitted affected skill asset SHALL prevent completion. Skill prose alone SHALL NOT establish implementation or per-file Effect compliance.

#### Scenario: Framework tests pass but skill guidance is stale

- **WHEN** grouped compiler/runtime tests pass while an affected repository skill still directs all applications to flat roots or creates a mixed layout
- **THEN** the change remains incomplete until guidance and its instruction-flow validation are corrected
