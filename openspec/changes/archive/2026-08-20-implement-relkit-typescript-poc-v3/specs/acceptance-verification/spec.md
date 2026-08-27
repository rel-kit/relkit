## Purpose

Defines the deterministic evidence, layered tests, phase gates, documentation checks, and scope/security acceptance required before the RelKit POC can be released.

## ADDED Requirements

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

Every local/cloud implementation of buckets, cache, jobs, and events SHALL run the shared logical contract for its declared capabilities, and no unsupported behavior SHALL be silently skipped.

#### Scenario: Provider capability differs

- **WHEN** two providers differ on signed URLs, ordering, durability, or distributed coordination
- **THEN** each suite asserts the declared capability and common behavior while explicitly testing the unsupported result

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

Release verification SHALL test packed packages and generator artifacts, production builds/containers, real supervisor/browser flows, Pulumi preview, and an isolated AWS stack rather than relying solely on workspace links, mocks, or manual checks.

#### Scenario: Workspace tests pass but package is broken

- **WHEN** a packed package cannot generate, install, build, or run the documented project
- **THEN** release acceptance fails even if workspace unit tests passed

### Requirement: Performance is baselined before optimization

The release record SHALL measure compile sizes/times, invocation and route overhead, local job/event throughput, stream latency, inspector graph rendering, and candidate activation at the defined descriptor scales, without making Rust or another subsystem a prerequisite.

#### Scenario: First stable baseline is recorded

- **WHEN** the complete fixture and scale generators are reproducible
- **THEN** results, environment, and commands are stored as the comparison baseline and later optimization decisions require measured regressions

### Requirement: Documentation is executable evidence

Getting-started, testing, deployment, architecture, and troubleshooting documentation SHALL match released commands and SHALL be followed verbatim on a clean environment as part of release acceptance.

#### Scenario: New developer flow is verified

- **WHEN** a reviewer uses only the documentation to create, test, inspect, build, preview, and clean up an application
- **THEN** each command succeeds as written or the release gate is rejected

### Requirement: Phases map one-to-one to review gates

Implementation SHALL proceed through phases 0–16 in dependency order, and each phase SHALL be approved only by reproducing the corresponding gate 0–16 commands/evidence and checking its explicit rejection conditions from a clean checkout.

#### Scenario: Later phase requests approval early

- **WHEN** a phase's prerequisite gate lacks reproducible passing evidence
- **THEN** work that depends on that phase is not approved or merged

#### Scenario: Phase review packet is complete

- **WHEN** a phase is submitted for review
- **THEN** it records phase/goal, files/packages, public inputs/outputs, failure behavior, generated changes, commands/results, limitations, and non-blocking follow-ups

#### Scenario: Fresh-task iterator reaches a phase boundary

- **WHEN** the last implementation unit in a phase finishes on the shared change branch
- **THEN** a fresh read-only gate task reviews a committed candidate from a clean worktree, records base/candidate identities and exact results, and blocks the next phase until the prerequisite and evidence are merged

### Requirement: Fresh implementation tasks have durable handoffs

Each OpenSpec checkbox SHALL run as one bounded fresh Luna (max) task and SHALL use repository change notes, exact task/spec references, current files/diff, decisions, blockers, and checks as its durable input instead of relying on prior chat context.

#### Scenario: One task hands off to the next

- **WHEN** a verified checkbox completes and another task in the same approved phase is pending
- **THEN** progress records the fresh task identity, files, checks, decisions, blockers, and exact next checkbox before a new same-directory task is dispatched

#### Scenario: Git authority or prerequisite merge is missing

- **WHEN** a clean phase review or next phase would require a commit, pull request, or merge that has not been explicitly authorized or completed
- **THEN** the iterator records the concrete blocker and stops without approving the gate or weakening the merged-prerequisite rule

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

### Requirement: Scope integrity remains enforced at release

No plugin/marketplace, alternate infrastructure engine, Rust component, separate application subscription primitive, or persistence/identity/workflow/knowledge-store graph concept SHALL be present in the POC release.

#### Scenario: Release artifacts are scanned

- **WHEN** source, public declarations, generated project, graph node kinds, inspector navigation, docs, and package list are inspected
- **THEN** only approved v3 concepts are present
