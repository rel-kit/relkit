## MODIFIED Requirements

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
