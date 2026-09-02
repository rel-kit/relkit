## Purpose

Defines the deterministic evidence, layered tests, phase gates, documentation checks, and scope/security acceptance required before the RelKit POC can be released.

## Requirements

### Requirement: Normative layered verification

The repository SHALL provide type fixtures, unit/schema tests, compiler/graph fixtures, provider contracts, runtime/HTTP integration, restart recovery, inspector API/browser E2E, generator smoke, Pulumi plan/mock/cloud, container lifecycle, and security/redaction coverage using the tools and repository layout defined by v3.

#### Scenario: Merge-blocking verification runs

- **WHEN** `bun run verify` is executed from a clean supported checkout
- **THEN** it runs frozen install/no-diff, format, lint, boundaries, typecheck/type fixtures, core/provider/integration/restart/inspector/generator/build/generated-file/security checks in documented order

### Requirement: Deterministic compiler and type evidence

Type fixtures SHALL assert the complete public inference boundary and expected failures, while compiler fixtures SHALL compare exact normalized diagnostics/exit codes/graph bytes and recompile under shuffled roots/order/time/process conditions.

#### Scenario: Golden contract changes

- **WHEN** a compiler or graph change modifies expected golden output
- **THEN** ordinary tests fail until goldens are deliberately updated with the documented opt-in command and the contract change is reviewed

### Requirement: Honest reusable provider contracts

Every standard bucket/cache implementation SHALL run shared logical contracts against supported protocol variants, and unsupported behavior SHALL be explicitly represented. S3 contracts SHALL cover AWS-style, R2-style, and MinIO-style endpoints; Redis contracts SHALL cover Redis/Valkey-compatible endpoints with TLS/authentication where applicable.

#### Scenario: Provider capability differs

- **WHEN** two providers differ on signed URLs, ordering, durability, or distributed coordination
- **THEN** each suite asserts the declared capability and common behavior while explicitly testing the unsupported result

#### Scenario: Bucket protocol matrix runs

- **WHEN** shared bucket tests run against AWS-style, R2-style, and MinIO-style endpoints
- **THEN** credentials, metadata, listing, cancellation, and signed URLs satisfy or explicitly reject the same declared contract

#### Scenario: Cache protocol matrix runs

- **WHEN** shared cache tests run against Redis, Valkey, and Upstash-compatible URLs
- **THEN** TLS/authentication, TTL, JSON values, deletion, and numeric increment satisfy the same declared contract

### Requirement: Failure injection and recovery proof

Test providers SHALL expose the named v3 failure points around writes, leases, handler-success/ack gaps, fan-out, observability rotation, provider lifecycle, and model/tool turns so tests prove data-integrity and at-least-once recovery claims.

#### Scenario: Acknowledgement gap is injected

- **WHEN** a durable job/event handler succeeds and the process fails before acknowledgement
- **THEN** restart testing observes possible duplicate execution and preserved safe state rather than assuming exactly-once delivery

### Requirement: Isolated deterministic tests

Each test SHALL use a unique temporary state root, deterministic IDs/time unless explicitly testing real time, isolated providers/telemetry, dynamic or no ports, bounded shutdown, and optional failed-state retention.

#### Scenario: Tests run concurrently

- **WHEN** independent runtime/provider tests execute in parallel
- **THEN** they do not share `.relkit/state`, observability files, provider instances, or fixed ports

### Requirement: Security verification covers every output

Security tests SHALL recursively scan terminal, JSON logs, local records, generated artifacts, graph/plan, HTTP APIs, SSE, server-rendered HTML, browser network responses, snapshots, and deployment reports for synthetic secrets and forbidden internal types/imports.

#### Scenario: Raw secret reaches any sink

- **WHEN** a scan detects one configured raw synthetic secret
- **THEN** the corresponding merge/release gate fails regardless of other functional test success

### Requirement: Packed and production-path acceptance

Release verification SHALL test packed packages and generator artifacts, the self-contained inspector, production builds/containers, real supervisor/browser flows, OpenAPI/Scalar protection, Pulumi preview, and an isolated AWS stack rather than relying solely on workspace links, mocks, or manual checks.

#### Scenario: Workspace tests pass but package is broken

- **WHEN** a packed package cannot generate, install, build, start development without a repository inspector path, serve the documented route/API reference, or shut down cleanly
- **THEN** release acceptance fails even if workspace unit tests passed

### Requirement: Performance is baselined before optimization

The release record SHALL measure compile sizes/times, invocation and route overhead, local job/event throughput, stream latency, inspector graph rendering, and candidate activation at the defined descriptor scales, without making Rust or another subsystem a prerequisite.

#### Scenario: First stable baseline is recorded

- **WHEN** the complete fixture and scale generators are reproducible
- **THEN** results, environment, and commands are stored as the comparison baseline and later optimization decisions require measured regressions

### Requirement: Documentation is executable evidence

Searchable getting-started, feature, CLI, testing, deployment, architecture, migration, and troubleshooting documentation SHALL match released APIs and commands and SHALL be followed verbatim on a clean environment as part of release acceptance.

#### Scenario: New developer flow is verified

- **WHEN** a reviewer uses only the documentation to create, test, inspect, use the API reference, build, preview, and clean up an application
- **THEN** each command and documented code example succeeds as written or the release gate is rejected

### Requirement: Final cross-role release approval

The final gate SHALL include clean install/verify, browser, container, packed generator, deployment, secret/declaration/scope scans, artifact checksums, release notes, performance results, AWS destroy evidence, and recorded approval by compiler/graph, runtime/reliability, developer-experience, observability/security, inspector/frontend, cloud/deployment, and release owners.

#### Scenario: One required owner or evidence item is missing

- **WHEN** Gate 16 is reviewed without a required result or sign-off
- **THEN** the POC remains unaccepted

### Requirement: Final product acceptance is internally consistent

The released graph, manifest, runtime APIs, inspector, generated project, OpenAPI/client, deployment plan, and cloud resources SHALL represent the same active contracts and stable identities, with all v3 authoring, runtime, recovery, security, and scope criteria passing.

#### Scenario: Inspector and runtime disagree

- **WHEN** an acceptance test detects that a displayed graph contract differs from active runtime or deployment behavior
- **THEN** Gate 16 fails until the inconsistency is fixed and regression evidence is added

### Requirement: Developer-first contract matrix

Acceptance SHALL cover every supported route method/segment/inference/override, uploads and limits, local/shared rate limits, typed callback events, config precedence, nested CLI help, OpenAPI/Scalar security, documentation search/generation, canonical examples, packaged development, and inspector accessibility.

#### Scenario: Public capability changes

- **WHEN** a public framework feature is added or modified
- **THEN** its owning focused tests, canonical commerce example, and user documentation change together before verification can pass

#### Scenario: Inference output changes

- **WHEN** route or event inference changes graph, OpenAPI, client, or registry output
- **THEN** deterministic type/compiler/integration goldens fail until the behavioral contract is deliberately reviewed

### Requirement: Documentation generation is deterministic

Generated API/CLI references, search data, and AI-readable documentation SHALL be reproducible, linked, and checked without hand edits, and public examples SHALL type-check and execute.

#### Scenario: Generated reference is stale

- **WHEN** public JSDoc or CLI metadata changes without regenerating its reference output
- **THEN** verification fails with the stale generated paths

#### Scenario: Documentation link or example breaks

- **WHEN** a guide contains a broken internal link or non-working executable example
- **THEN** documentation verification fails before release

### Requirement: Inspector accessibility and visual regression are focused

Browser acceptance SHALL cover semantic keyboard flows and a bounded set of representative responsive/theme visuals for the shell, resource table/sheet, graph, trace waterfall, and API reference rather than snapshotting every page.

#### Scenario: Critical inspector UI regresses

- **WHEN** a representative critical flow loses its accessible name, keyboard operation, redaction, responsive layout, or expected visual structure
- **THEN** focused browser acceptance fails

### Requirement: Simplified authoring has layered acceptance evidence

The repository SHALL provide type, unit, compiler, runtime, HTTP, template, documentation, and packaged-product evidence for services, inferred IDs, structured requests, descriptor invocation, function-derived tools, retry hints, and AI SDK v7 integration without requiring cloud credentials or paid model calls.

#### Scenario: Public declarations are checked

- **WHEN** type fixtures compile
- **THEN** service members, `function.invoke`, `function.asTool`, `tool.invoke`, optional IDs, structured request parameters, error retry forms, and agent model selectors infer their intended types while unsafe or ambiguous forms fail

#### Scenario: Compiler fixtures run twice

- **WHEN** fixtures with inferred IDs and services compile in shuffled order and different roots
- **THEN** IDs, graph, manifest, OpenAPI tags, diagnostics, generated clients, and hashes are deterministic, and collision fixtures fail with both source locations

#### Scenario: Invocation matrix runs

- **WHEN** one function is invoked standalone, from another function, over HTTP, by a job/event, and as a tool
- **THEN** validation, errors, limits, service middleware, context isolation, parent/child traces, dynamic edges, cycle rejection, and cleanup satisfy the same common-engine contract

#### Scenario: AI matrix runs offline

- **WHEN** OpenAI and Anthropic configuration, default resolution, exact model selection, tool calls, approvals, invalid output, cancellation, and limits are tested
- **THEN** official AI SDK test doubles provide deterministic evidence with no network or resolved secret in any artifact

### Requirement: Domain-first services have layered release evidence

Release verification SHALL cover service identity and typing, domain discovery and boundaries, graph/manifest contracts, Drizzle and Better Auth lifecycle, route protection order, Inspector presentation, generated templates, canonical examples, documentation, and migration diagnostics without cloud credentials or paid calls.

#### Scenario: Breaking release is verified

- **WHEN** focused and full repository verification run against migrated source and legacy fixtures
- **THEN** new domain applications pass, legacy patterns fail with actionable diagnostics, runtime resources drain safely, and generated artifacts contain no live values or secrets

### Requirement: Event-function authoring has layered acceptance evidence

Acceptance SHALL verify event registry inference, narrowed publication clients, event-only restrictions, authored-function graph lowering, provider fan-out/recovery, Inspector projections, exact deployment permissions, and clean generated projects without legacy event APIs.

#### Scenario: Breaking event API is accepted

- **WHEN** repository type, compiler, contract, runtime, Inspector, deployment, example, generator, and documentation cohorts run
- **THEN** valid event functions pass, all forbidden invocation/target paths fail, and source/export scans find no listener or selector compatibility surface

### Requirement: Provider architecture has layered cohort evidence

Acceptance SHALL combine type tests, protocol and normalization unit tests, compiler determinism and stale-artifact tests, runtime lifecycle and explicit-replacement tests, generated-project smoke tests, integration package packing, Docker integration tests, deployment plan/mocks, Inspector tests, and full repository verification.

#### Scenario: Contract cohort is partially stale

- **WHEN** graph, manifest, runtime-integration plan, local-service plan, deployment plan, or override generation does not match the expected fingerprint
- **THEN** the relevant build, runtime, supervisor, Inspector, and deployment tests prove rejection before activation or mutation

### Requirement: Local service isolation has executable evidence

Tests SHALL cover separate profiles, required-only startup, all-binding startup, `--local=off`, pinned recipe health, random loopback ports, hot-reload reuse, changed-plan reconciliation, detached adoption, stop/reset protection, worktree isolation, stale-lease recovery, secure state, and secret-free output.

#### Scenario: Docker integration suite is opted in

- **WHEN** `RELKIT_TEST_DOCKER=1` enables Redis and MinIO tests
- **THEN** real containers prove health, persistence, isolated outputs, cleanup, and bounded failure behavior

### Requirement: Telemetry and documentation are release evidence

Acceptance SHALL prove complete redacted Inspector persistence despite export sampling, independent Sentry/OTLP failure behavior, CloudWatch host routing, executable examples, generated API/CLI reference freshness, search/link correctness, docs build, landing accessibility/responsiveness, and visual inspection of changed product surfaces.

#### Scenario: External exporter drops a trace

- **WHEN** export sampling or failure prevents remote delivery
- **THEN** tests still find the complete redacted local timeline and safe exporter diagnostic in Inspector

### Requirement: Cloud acceptance remains separately authorized

Local implementation gates SHALL use pure plan tests, Pulumi mocks, generated-program tests, and containers; paid or mutating cloud acceptance SHALL remain a separately authorized release gate and completion of this change SHALL NOT constitute final cloud release approval.

#### Scenario: Implementation verification runs without cloud authorization

- **WHEN** the change reaches local completion
- **THEN** no paid cloud resource is created and required release-gate cloud evidence remains explicitly outstanding
