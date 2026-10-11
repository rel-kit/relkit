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

### Requirement: End to end instrumentation evidence

Release evidence SHALL cover commerce middleware/database/cache/nested functions/event fan-out/job retry, agent/tools, outbound clients and deliberately paused live HTTP execution with explicit relationship assertions. The first invoice attempt SHALL observe a bucket failure then request retry through the declared-error mechanism.

#### Scenario: Browser follows execution

- **WHEN** acceptance runs against the real Inspector and Bun host
- **THEN** a developer can inspect active and terminal work, span metadata/logs, async retries, direct trace navigation, reconnect and missing/truncated state

### Requirement: Instrumentation verification gates

Verification SHALL cover concurrent async context, validation/admission, exactly-once completion, observer failures, streaming/bodyless/early-host paths, durable restart and malformed metadata, mocked AWS, indexed storage parity/limits/retention, OTLP/privacy/bundle safety and exporter outages. Strict OpenSpec, repository verify, restart/integration/security, generated-project and browser checks SHALL have recorded outcomes. HTTP/operation/query/heap performance SHALL be compared to baseline and median overhead above 5 percent or p95 above 10 percent investigated, not advertised as guarantees.

#### Scenario: Environment is unavailable

- **WHEN** an environment-dependent check cannot run
- **THEN** evidence explicitly records the unavailable check without claiming success or running unapproved paid cloud work

### Requirement: Every scaffold kind has executable template coverage

Acceptance verification SHALL run every add kind against temporary projects generated from the minimal, API, and agent templates and SHALL require the resulting project to pass `relkit check`. Service bundle snapshots SHALL verify both deterministic files and normalized graph relationships.

#### Scenario: Full bundle is tested across templates

- **WHEN** the generator acceptance matrix adds a full service to each template
- **THEN** every project checks successfully and the normalized relationship snapshots agree

### Requirement: Discovery and route generation cover ambiguity and path shapes

Tests SHALL cover discovery with multiple services, functions, events, tools, prompts, models, and custom profiles, plus root, static, dynamic, required catch-all, optional catch-all, normal route, service route, and route-method collision behavior.

#### Scenario: Dynamic nested route is generated

- **WHEN** `/users/:id/details` is supplied
- **THEN** acceptance verifies the route file at `src/routes/users/[id]/details/route.ts` and the compiler recovers the same route path

### Requirement: Singleton scaffolds cover every supported dialect

Tests SHALL cover standalone database and auth-chained database generation for SQLite, PostgreSQL, and MySQL, including singleton collisions, schema export collisions, dialect-specific drivers, and Better Auth tables and mounts.

#### Scenario: Auth chains MySQL database creation

- **WHEN** auth generation selects MySQL in a project without a database
- **THEN** the generated project checks with the MySQL Better Auth schema and contains no generic `items` table

### Requirement: Transaction rollback is proven under injected failures

Acceptance tests SHALL inject installation and validation failures and prove removal of new files, restoration of previous bytes, file modes, and lockfile, and preservation of unrelated dirty files.

#### Scenario: Installation mutates lockfile then fails

- **WHEN** an injected installer changes `bun.lock` before returning failure
- **THEN** rollback restores the exact original lockfile and all scaffold-touched paths

### Requirement: Packed creation and interaction paths are equivalent

Packed-artifact smoke tests SHALL exercise both creation entrypoints, interactive choices through an injected prompt driver, and chained headless add commands, with prompts and progress absent from JSON output.

#### Scenario: Prompt driver and flags choose the same project

- **WHEN** an injected prompt sequence and explicit flags resolve identical create and add choices
- **THEN** their normalized results and generated project bytes are identical

### Requirement: Provider runtime and documentation evidence is complete

Verification SHALL cover local event/job runtime registration and lifecycle, use the existing opt-in Docker suite for Redis and MinIO, and regenerate and test CLI, onboarding, add-command, database/auth, and local-provider documentation without adding containers or cloud cost.

#### Scenario: Repository verification runs locally

- **WHEN** the change is prepared for release without cloud authorization
- **THEN** CLI, compiler, local-provider, generator, integration, docs, typecheck, guardrail, and full local verification suites pass while cloud acceptance remains skipped

### Requirement: TJ-041 Regression and native evidence

Supported capabilities MUST reference passing native and failure-recovery tests, and existing Relkit verification MUST remain green.

#### Scenario: Regression and native evidence

- **WHEN** an SDK, backend or image version changes
- **THEN** its affected native/recovery fixtures must pass before the capability is promoted as supported

### Requirement: Native semantics and fault matrix gate release

Every advertised native capability SHALL reference passing pinned native and restart/failure evidence. This change's F01–F28 matrix, complete type/schema/naming/provider fixtures and deterministic controller/property cases SHALL be executable for the in-scope Inngest and effect-mq local paths. Trigger native/Docker evidence and Pulumi, AWS, and managed-cloud evidence are explicitly deferred from this change's completion gate; those modes MUST remain labeled not-tested and MUST NOT be advertised as passed. Mocks alone SHALL not certify durability, retries, sleep, concurrency, cleanup, scheduling or version routing. Coverage SHALL target at least 90 percent of new validation/binding/watch branches with mutation checks for tenant guards, abort cleanup, stale epochs, duration conversion and retry multiplication.

The RG01–RG13 review regressions in design §18.9 SHALL also have evidence in their designated suites. Native semantics SHALL use real native fixtures; whole-application discovery/uniqueness SHALL use compiler fixtures rather than isolated TypeScript assertions.

#### Scenario: A supported feature has no evidence

- **WHEN** a capability report marks native or adapter support without a passing applicable fixture
- **THEN** release validation fails

#### Scenario: Crash fixture is mocked

- **WHEN** sleep recovery is tested only by throwing a JavaScript exception
- **THEN** native certification remains incomplete until the required process/container failure test passes

#### Scenario: Review gap has no executable evidence

- **WHEN** a completed checklist claims a review regression is covered only by planning prose or the wrong test layer
- **THEN** the completion audit remains incomplete until the designated behavior is exercised

### Requirement: Release distinguishes core readiness from full provider completion

Core readiness SHALL require task/job APIs, deterministic binding, Inngest account-free durable tasks plus native scheduling, typed secure clients, bounded Inspector, migration/docs/scaffold and relevant restart/security/package tests. For this change, completion additionally requires the certified local effect-mq subset; Trigger and Pulumi/AWS/managed-cloud evidence are deferred by explicit scope decision rather than treated as passed. Unavailable or deferred modes SHALL mean not tested, not passed; billable acceptance SHALL require isolated explicitly authorized credentials and budget.

#### Scenario: Deferred adapter evidence is absent

- **WHEN** Trigger evidence is absent from this change's explicitly deferred scope
- **THEN** the evidence report keeps Trigger not-tested and does not block the Inngest/effect-mq completion gate or advertise Trigger support

#### Scenario: Hosted credentials absent

- **WHEN** local tests pass without managed-provider credentials
- **THEN** hosted support stays unverified and no billable test is attempted

### Requirement: Verification preserves the repository release path

Focused jobs suites SHALL be wired into existing test orchestration, verification, prepush, docs/reference and packed scaffold/CI checks. Existing functions/events/agents/storage/cache/local-service/deployment boundaries SHALL remain covered. Controller/load fixtures SHALL include 100 unique watches, 1000 shared observers and 10000 create/dispose cycles with bounded metrics; native quota-aware sizes SHALL be recorded rather than claimed as universal throughput.

#### Scenario: Observer lifecycle stress runs

- **WHEN** the declared fixture completes repeated connect/disconnect/dispose and Strict Mode cycles
- **THEN** resource counts return to baseline within the cleanup bound and retained state stays scope-correct

### Requirement: Specialized package migration has complete source and reviewer coverage

Acceptance of the specialized package migration SHALL account for every authored TypeScript file beneath `packages/drizzle`, `packages/better-auth`, and `packages/providers-standard`, including root tests, configuration, and hidden or ignored authored files. Generated output, dependencies, binaries, and vendor code SHALL be explicitly excluded. Every implementation phase SHALL end with independent review of every changed TypeScript file, including added, moved, and supporting files outside the primary package roots, against the use-effect contract and public compatibility requirements. Findings SHALL be resolved and affected checks rerun before phase acceptance.

#### Scenario: A file needs no runtime migration

- **WHEN** an inventoried file is a pure helper, React integration, type-only companion, or empty compatibility entrypoint
- **THEN** acceptance records its reviewed disposition and does not manufacture unrelated services or runtime features solely to change that file

#### Scenario: Review covers the actual final diff

- **WHEN** a phase is ready for acceptance
- **THEN** an independent reviewer reads each changed TypeScript file through EOF, checks applicable lifecycle/concurrency/error/observability/schema/documentation behavior, and rechecks files changed to address findings

### Requirement: Specialized migration is accepted against the linked regression demo

Final acceptance SHALL replay the existing credential-free regression demo and retained generated-host fixture suites against the changed framework build and correctly resolved workspace links, including origin security, invalid agent input, invalid channel parameters, stream cancellation/presence cleanup, and browser behavior. Focused database/auth tests SHALL supplement those broader checks when the demo does not exercise the specialized packages. Evidence SHALL identify the tested checkout/build, commands, outcomes, runtime endpoints, link resolution, and known baseline failures without overwriting historical results.

#### Scenario: Demo links resolve another checkout

- **WHEN** demo dependencies or running server artifacts resolve to the original checkout instead of the candidate implementation
- **THEN** the replay does not qualify as candidate acceptance until the correct links and build are used

#### Scenario: Historical diagnostic checks fail

- **WHEN** a retained diagnostic reproduces a previously documented unrelated finding
- **THEN** acceptance records the baseline and candidate outcomes separately and does not describe the failing command as passed or silently clear the finding

#### Scenario: Optional paid or environment-dependent evidence is unavailable

- **WHEN** a paid model probe is not authorized, or a required local prerequisite is unavailable
- **THEN** its outcome is recorded as not run or blocked, historical provider evidence remains historical, and missing required offline evidence prevents a complete offline acceptance claim

### Requirement: Empty standard provider package has an explicit compatibility decision

Acceptance SHALL document the current purpose, runtime consumers, release/build references, and retention or retirement decision for `providers-standard`. This migration SHALL preserve its empty public compatibility surface; a future retirement SHALL require coordinated consumer and release-tooling migration rather than introducing artificial runtime functionality.

#### Scenario: Package has no authored runtime implementation

- **WHEN** the package audit finds only an empty export and infrastructure references
- **THEN** the migration records why the compatibility package is retained and verifies that obsolete runtime exports remain absent

### Requirement: Generated backend startup has a reproducible packed baseline

Before optimization, acceptance SHALL record a repeatable packed-package baseline using the same external command-to-correct-response boundary used for final readiness certification. The earlier roughly seven-second observation SHALL remain historical context, not per-stage attribution. Baseline and candidate records SHALL identify package/tool versions, host, commands, artifacts, expected response, prerequisite state, individual samples, and optional stage timing without replacing total elapsed time.

#### Scenario: Baseline is captured

- **WHEN** current packed packages generate and install a fresh project outside the repository
- **THEN** the benchmark records `bun dev` invocation through first correct public backend response, raw durations and environment before runtime optimization

### Requirement: Packed readiness uses the complete command-to-response clock

The benchmark SHALL start a monotonic clock immediately before spawning the generated project's `bun dev` command and stop only after receiving and validating the complete first correct HTTP response through its public development address. Bun dispatch, CLI startup, cache verification, service adoption, child execution, route loading, supervisor activation, proxying, and probe overhead SHALL remain inside that interval. Packed packages SHALL resolve outside the workspace without contributor overrides or a previously running backend. Polling interval SHALL be bounded at no more than 5 ms and no interval or command overhead SHALL be subtracted.

#### Scenario: Ready banner precedes serving

- **WHEN** a process prints Ready or binds its port before the expected backend response works
- **THEN** the timer continues and the banner/bind cannot qualify as a passing sample

#### Scenario: Response body is incorrect

- **WHEN** HTTP succeeds but returns a placeholder, wrong greeting, wrong status, or stale generation/cohort
- **THEN** the attempt does not qualify and remains recorded as failed if the correct response is not obtained within the bound

#### Scenario: Poll observes a response after the threshold

- **WHEN** correct complete response observation occurs at or above 500 ms
- **THEN** the sample fails without subtracting polling delay or rounding it below the threshold

### Requirement: Every supported creation combination passes every measured start

Readiness certification SHALL enumerate every valid normalized runtime-affecting combination, including fullstack, jobs, cloud/deploy selections, and examples enabled/disabled. Each shipped combination SHALL pass a controlled 20-start fresh-installed set and a separate controlled 20-start unchanged-restart set on the current Apple M1 Pro/macOS arm64 reference host with pinned Bun. Every run SHALL be strictly below 500 ms. The record SHALL include every attempt plus median, nearest-rank 95th percentile, and maximum, without discarding warmups, failures, outliers, or cleanup failures. Post-install preparation for `--no-install` SHALL receive equivalent functional and readiness evidence.

#### Scenario: One combination has a slow run

- **WHEN** one required run is at or above 500 ms despite a passing median or p95
- **THEN** that combination fails certification, is hidden interactively, and its explicit flags are rejected

#### Scenario: Default combination fails

- **WHEN** default minimal creation lacks current passing evidence
- **THEN** the change is not ready to ship and another template cannot replace the default acceptance gate silently

#### Scenario: An offered combination is unmeasured

- **WHEN** the resolver can produce a valid runtime-affecting tuple without current evidence
- **THEN** release validation fails until it is measured or consistently removed from interactive and explicit creation

#### Scenario: Tool or template identity changes

- **WHEN** relevant tool, runtime, package, template, configuration, or protocol identity changes after certification
- **THEN** affected capability evidence is stale and must be recertified before advertising that tuple

### Requirement: Readiness probes use actual generated behavior

Example-bearing projects SHALL be timed against an actual safe generated backend route with its expected status/body; fullstack SHALL use API `/hello`, independently of web-page readiness. Jobs projects SHALL use their actual generated safe example route and SHALL retain required native certification. Without examples, acceptance SHALL prove live active graph, generation, route-table, and activation identity through the backend's protected graph-serving readiness endpoint. A static health stub SHALL not pass.

#### Scenario: Fullstack web compilation is slow

- **WHEN** the API answers `/hello` correctly while the web page is still compiling
- **THEN** API command-to-response timing qualifies independently, and the record separately identifies web readiness

#### Scenario: Examples are disabled

- **WHEN** `--no-examples` produces no example route
- **THEN** the benchmark validates live graph-serving readiness and rejects liveness or static snapshot JSON as proof

### Requirement: Docker provisioning and fallback have separate correctness evidence

Required Docker services SHALL be healthy and safely adoptable before t0 in gated starts. Cold provisioning, installation, and edited-source fallback SHALL be recorded separately without the 500 ms gate. Every cold setup SHALL retain visible prerequisite progress and fail safely if required services cannot become healthy. Missing/stale/corrupt snapshots SHALL exercise full validation, and invalid edits SHALL never activate or displace the last-known-good generation.

#### Scenario: Cold Docker setup is required

- **WHEN** a generated jobs project needs images or services provisioned
- **THEN** setup time is reported separately and only a subsequent launch with verified healthy services is subject to the 500 ms gate

#### Scenario: Required service is unhealthy or its lease mismatches

- **WHEN** a prestarted service has wrong ownership/plan identity or fails health
- **THEN** development does not bypass reconciliation to claim readiness and the controlled sample is invalid or failed with explicit evidence

#### Scenario: Valid and invalid edits follow a passing restart

- **WHEN** source is edited first validly and then invalidly
- **THEN** full fallback activates only the valid current graph, the invalid candidate leaves it serving, and both fallback results are recorded separately from unchanged-start timing

### Requirement: Startup edge cases and implementation gates are executable

Implementation acceptance SHALL cover relocation after atomic creation, added/deleted files, helper/asset changes, config/dependency/tool changes, cache tampering, rapid edits, concurrent preparation, deferred loading, backend/inspector port conflicts, failed children, cancellation, streaming drain, shutdown, and delayed/failed inspector or telemetry including overflow/redaction/handoff. Every created or edited source file SHALL be reviewed against `$use-effect`, including version-matched Effect implementation/test/example checks, scoped lifetimes, injectable dependencies/test Layers, preserved typed failures/defects/interruption, and behavioral evidence. Focused tests, packed generator acceptance, `bun run prepush`, and strict OpenSpec validation SHALL have recorded passing outcomes before implementation completion.

#### Scenario: Support startup is deliberately delayed

- **WHEN** real packed lifecycle fixtures delay inspector and persistence beyond backend readiness
- **THEN** correct backend responses still pass independently, early records remain bounded/redacted, loss is explicit, and shutdown leaves no owned processes or readers

#### Scenario: Cache or source races are injected

- **WHEN** fixtures inject corruption, additions/deletions, dependency changes, or edits during validation/activation
- **THEN** stale or invalid source cannot activate and cleanup preserves the prior complete artifacts and generation

#### Scenario: Required reference evidence is unavailable

- **WHEN** hardware, prerequisites, native certification, or any required implementation gate cannot be exercised
- **THEN** the record identifies it as blocked or not run rather than passed, and the applicable capability is not promoted
