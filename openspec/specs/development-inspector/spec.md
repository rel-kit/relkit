## Purpose

Defines last-known-good development activation and a complete browser inspector that reads versioned APIs rather than reconstructing application or provider state.

## Requirements

### Requirement: Last-known-good candidate activation

The development supervisor SHALL compile, start, hash-check, version-check, and readiness-check a candidate generation before activation; any compilation, startup, hash, API-version, or readiness failure SHALL leave the active generation serving traffic.

#### Scenario: Source change does not compile

- **WHEN** a developer saves invalid source while a valid generation is active
- **THEN** diagnostics update and the prior generation remains reachable on the stable development port

#### Scenario: Candidate is ready

- **WHEN** a candidate passes all verification
- **THEN** the supervisor atomically makes it active and emits a correlated generation-change event

### Requirement: Stable proxy and bounded drain

The supervisor SHALL own a stable development address, proxy to one atomic active target, allow existing requests to finish on the prior generation, stop new prior-generation traffic, and cancel remaining work after the configured drain timeout.

#### Scenario: Long request spans a switch

- **WHEN** a candidate activates while an old request is in flight
- **THEN** new requests reach the candidate and the old request completes on its original generation unless drain timeout expires

### Requirement: Generation isolation and latest-change handling

Candidate generated outputs and runtime state SHALL be generation-specific, and source change coalescing SHALL preserve the latest source state without allowing an older candidate to overwrite a newer accepted generation.

#### Scenario: Rapid saves occur

- **WHEN** multiple source batches arrive during compilation
- **THEN** obsolete candidates cannot become active after a newer source version and the latest batch is eventually evaluated

### Requirement: Supervisor states match the activation protocol

The supervisor SHALL expose only `idle`, `compiling-candidate`, `starting-candidate`, `verifying-hash-and-readiness`, `switching`, `draining-previous`, and `active` as lifecycle states; compile/start/verification failures SHALL be recorded as outcomes that preserve the active generation rather than as an extra lifecycle state.

#### Scenario: Candidate verification fails

- **WHEN** a candidate has a graph/hash, protocol, or readiness failure
- **THEN** the candidate is stopped, the failure outcome and diagnostics are emitted, and the supervisor returns to the appropriate `active` or `idle` state

### Requirement: Versioned protected inspector APIs

The backend SHALL provide versioned APIs for graph/descriptors, environment metadata, diagnostics, runtime state, requests/logs/traces, and safe local actions; production SHALL disable or authenticate these APIs and SHALL disable local administrative controls by default.

#### Scenario: Local job retry is requested

- **WHEN** the development inspector calls the protected retry action for an eligible dead-letter job
- **THEN** the backend validates mode, identity, and state before applying and recording the action

#### Scenario: Production control is unauthenticated

- **WHEN** an unauthenticated client calls a local control endpoint in production
- **THEN** the request is rejected and no action occurs

### Requirement: Inspector is an API-only consumer

The Next.js inspector SHALL consume versioned backend APIs/SSE and SHALL NOT scan application source independently, import handlers/live runtime objects, read provider files, resolve environment values, or construct cloud clients.

#### Scenario: Inspector server bundle is scanned

- **WHEN** inspector imports and browser payloads are examined
- **THEN** they contain protocol/client dependencies only and no application handler, provider client, secret, or runtime implementation object

### Requirement: Complete inspector navigation

The inspector SHALL provide overview, graph, routes, functions, jobs, events/listeners, buckets, cache, tools, agents, requests, logs, traces, environment metadata, and diagnostics list/detail pages defined by the v3 baseline.

#### Scenario: Full fixture is inspected

- **WHEN** the deterministic commerce fixture is active
- **THEN** every required navigation destination renders its matching graph/API data and the active graph hash is visible

### Requirement: Route, function, and request workflows

Route pages SHALL show mapping/schema/OpenAPI/source/recent requests and a schema-driven composer; function pages SHALL show schemas, declared and observed edges, limits, source, invocation, logs, and traces; request detail SHALL show its complete correlated timeline.

#### Scenario: Request composer succeeds

- **WHEN** a developer submits valid composer values
- **THEN** the backend request runs, the response is shown, and the new request record and trace are linked and appear live without page reload

#### Scenario: Composer validation fails

- **WHEN** submitted values violate the route contract
- **THEN** the UI shows safe field-level or response validation feedback and links any resulting request record

### Requirement: Managed capability and agent workflows

Job/event/resource/tool/agent pages SHALL show declared contracts and safe current state, including job retry/dead-letter controls in local mode, event selector expansions/deliveries, capability metadata, and agent model/tool/approval timelines.

#### Scenario: Event detail renders

- **WHEN** an event has publishers and matching `onEvent` bindings
- **THEN** the page uses event/listener/trigger terminology, shows versioned schemas and delivery state, and exposes no separate application subscription resource

### Requirement: Live resilient diagnostics and telemetry

The inspector SHALL reconnect SSE by cursor, update live requests/logs/generation/diagnostics, and keep the active application UI usable when a candidate is invalid.

#### Scenario: Invalid candidate follows valid traffic

- **WHEN** compilation diagnostics arrive while the active generation continues handling requests
- **THEN** the UI shows both current diagnostics and the still-active graph/request stream

### Requirement: Safe project-relative source links

Source metadata SHALL stay project-relative, and local editor links SHALL be generated only for configured editor choices in local development.

#### Scenario: Source link is rendered

- **WHEN** a descriptor includes a project-relative file, line, and column
- **THEN** the inspector builds a local editor link without exposing an arbitrary absolute server path to non-local clients

### Requirement: Accessible critical interactions

Navigation, request composition, local actions, approvals, diagnostics, and live status SHALL have semantic labels and keyboard-operable critical flows, with stable test IDs used only where semantics are insufficient.

#### Scenario: Keyboard-only route invocation

- **WHEN** a user navigates and submits the route composer without a pointer
- **THEN** focus, labels, errors, and submission behavior remain usable and testable
