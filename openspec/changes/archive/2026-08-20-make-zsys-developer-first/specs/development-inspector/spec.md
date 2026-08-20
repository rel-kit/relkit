## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Complete inspector navigation

The inspector SHALL provide overview, graph, routes, functions, jobs, events/listeners, buckets, cache, tools, agents, requests, logs, traces, environment metadata, diagnostics, and API reference list/detail destinations.

#### Scenario: Full fixture is inspected

- **WHEN** the deterministic commerce example is active
- **THEN** every required navigation destination renders its matching graph/API data, the active graph hash is visible, and the API reference represents the same generation

### Requirement: Accessible critical interactions

Navigation, search/filtering, request composition, detail sheets, graph exploration, local actions, approvals, diagnostics, trace exploration, and live status SHALL have semantic labels, visible focus, and keyboard-operable critical flows, with stable test IDs used only where semantics are insufficient.

#### Scenario: Keyboard-only route invocation

- **WHEN** a user navigates and submits the route composer without a pointer
- **THEN** focus, labels, errors, submission behavior, response links, and sheet dismissal remain usable and testable
