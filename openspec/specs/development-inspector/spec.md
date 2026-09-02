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

The inspector SHALL provide overview, graph, routes, middleware, functions, jobs, events/listeners, buckets, cache, tools, agents, requests, logs, traces, environment metadata, diagnostics, and API reference list/detail destinations.

#### Scenario: Full fixture is inspected

- **WHEN** the deterministic commerce example is active
- **THEN** every required navigation destination renders its matching graph/API data, the active graph hash is visible, and the API reference represents the same generation

### Requirement: Route, middleware, function, and request workflows

Route pages SHALL link matching middleware and show coverage; middleware pages SHALL show path, execution order, source, and linked matching routes; function pages SHALL show schemas, declared and observed edges, limits, source, invocation, logs, and traces; request detail SHALL show its complete correlated timeline.

#### Scenario: Route middleware is inspected

- **WHEN** a developer opens a route with matching middleware
- **THEN** each `always` or `conditional` relationship links to a canonical middleware detail page and displays its execution order

#### Scenario: Request composer succeeds

- **WHEN** a developer submits valid composer values
- **THEN** the backend request runs, the response is shown, and the new request record and trace are linked and appear live without page reload

#### Scenario: Composer validation fails

- **WHEN** submitted values violate the route contract
- **THEN** the UI shows safe field-level or response validation feedback and links any resulting request record

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

Navigation, search/filtering, request composition, detail sheets, graph exploration, local actions, approvals, diagnostics, trace exploration, and live status SHALL have semantic labels, visible focus, and keyboard-operable critical flows, with stable test IDs used only where semantics are insufficient.

#### Scenario: Keyboard-only route invocation

- **WHEN** a user navigates and submits the route composer without a pointer
- **THEN** focus, labels, errors, submission behavior, response links, and sheet dismissal remain usable and testable

### Requirement: Responsive accessible inspector shell

The inspector SHALL provide a responsive collapsible navigation shell, global search, active-generation health, graph identity, light/dark themes, visible focus, reduced-motion support, and semantic keyboard-operable controls.

#### Scenario: Inspector is used on a narrow viewport

- **WHEN** a developer opens the inspector on a supported mobile-width viewport
- **THEN** primary navigation, current health, content, and critical actions remain available without horizontal page overflow

#### Scenario: Reduced motion is requested

- **WHEN** the browser requests reduced motion
- **THEN** non-essential transitions and graph animations are disabled without removing state feedback

### Requirement: Consistent resource exploration

Resource list pages SHALL share accessible server-backed search, supported filters, cursor pagination, loading/empty/error states, and quick-detail sheets while retaining canonical linkable detail routes.

#### Scenario: A filtered result is opened

- **WHEN** a developer filters resources and opens a quick detail sheet
- **THEN** the sheet is keyboard accessible and offers a canonical detail link without replacing URL-addressable navigation

### Requirement: Interactive accessible application graph

The graph SHALL support pan, zoom, fit, minimap, controls, search, kind filters, declared-versus-observed edge styling, and node details while retaining a semantic relationship table fallback.

#### Scenario: Graph is explored without a pointer

- **WHEN** a keyboard or screen-reader user explores the application graph
- **THEN** the relationship table exposes the same nodes/edges and links to the same details as the visual canvas

### Requirement: Trace tree and waterfall

Trace detail SHALL present an expandable span hierarchy and aligned waterfall with status, duration, available span/resource metadata, correlated logs/work links, search, error filtering, and timeline zoom using only redacted API data.

#### Scenario: Failed trace is inspected

- **WHEN** a trace contains a failed nested span
- **THEN** the developer can locate it by hierarchy or error filter, inspect safe attributes/logs, and navigate to correlated records

### Requirement: Inspector presents the domain model

The Inspector SHALL provide domain list and detail views backed by service graph nodes and SHALL group all domain-owned public and internal functions, events, errors, jobs, tools, agents, caches, buckets, generated artifacts, dependencies, and routes.

#### Scenario: Developer inspects a domain

- **WHEN** the developer opens the orders domain
- **THEN** the Inspector distinguishes public and internal artifacts and links its routes and service dependencies

### Requirement: Specialized services expose safe details

Database and authentication domains SHALL display only serializable schema/model, dialect, base-path, protected-route, and dependency metadata and SHALL not expose clients, credentials, handlers, callbacks, or secrets.

#### Scenario: Database service is inspected

- **WHEN** the database domain detail is loaded
- **THEN** tables, safe column metadata, selectors, and custom method names are visible without a live database object

### Requirement: Inspector presents authored event functions

Event views SHALL join generated trigger-to-event and trigger-to-function edges to show authored event functions as consumers, and function views SHALL distinguish callable and event-only invocation modes while retaining publisher, delivery, retry, replay, and dead-letter state.

#### Scenario: Event detail renders consumers

- **WHEN** an event has publishers and multiple event functions
- **THEN** the page links each authored function, shows its independent runtime state, and exposes no selector expansion or hidden listener function

### Requirement: Inspector presents integration topology safely

Inspector SHALL show each logical resource, capability, physical profile, adapter, connected/local/infrastructure source, declared features, required binding value names, selected integration package/version, and deployment role without displaying resolved values, credentials, implementation objects, or arbitrary module paths.

#### Scenario: Mixed cache topology is inspected

- **WHEN** an application has local/connected Redis and connected Cloudflare profiles
- **THEN** their logical relationships and source behavior are distinct and no view implies that the host owns connected services

### Requirement: Inspector presents local service lifecycle

Local Inspector APIs and views SHALL show planned, starting, healthy, unhealthy, stopped, detached, and blocked lease states plus binding, recipe, plan-hash, and safe health metadata; non-local Inspector access SHALL expose no local control operations.

#### Scenario: Local service health fails

- **WHEN** a required Redis recipe does not become healthy
- **THEN** Inspector shows the binding-scoped diagnostic while the last-known-good application generation remains active

### Requirement: Inspector presents complete telemetry before export sampling

Request, log, trace, diagnostic, and generation views SHALL use the complete redacted local store and SHALL separately display exporter selection, health, dropped-export counters, and sampling decisions.

#### Scenario: Trace is not exported

- **WHEN** external sampling excludes a trace
- **THEN** its complete local timeline remains navigable and the view indicates only that external export was skipped

### Requirement: Inspector verifies activation cohorts

Generation state and readiness APIs SHALL report the composite activation fingerprint, and the supervisor SHALL refuse a candidate whose graph, manifest, runtime-integration, local-service, or override identity differs from the expected cohort.

#### Scenario: Candidate has stale local overrides

- **WHEN** readiness reports an override generation from another local plan
- **THEN** activation fails safely and Inspector identifies the mismatched cohort member
