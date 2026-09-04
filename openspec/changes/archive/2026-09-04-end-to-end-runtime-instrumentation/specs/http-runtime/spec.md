## MODIFIED Requirements

### Requirement: Request lifecycle propagation

Every inbound application request SHALL receive a fresh local request ID and origin request ID, accept only valid W3C parent context, ignore incoming request/origin identity headers, and return x-request-id without x-trace-id. Correlation ID SHALL remain application-defined. One outermost server span SHALL cover HTTP arrival through runtime-observable response-body termination across generated host and nested routing integrations.

#### Scenario: Client disconnects

- **WHEN** a connected client closes before the response completes
- **THEN** the function signal is aborted and the request completes exactly once as cancelled

#### Scenario: Remote parent is supplied

- **WHEN** a request supplies valid traceparent and arbitrary request identity headers
- **THEN** the server span has the remote trace parent, fresh local request identity and no inferred business correlation ID

## ADDED Requirements

### Requirement: Complete HTTP boundary coverage

Raw/compiled routes, RPC, MCP, static files, health/readiness, startup/draining rejection, auth/limits and unmatched requests SHALL be observed; telemetry ingestion/query/SSE and exporter transport SHALL be excluded. Middleware SHALL be inclusive child spans. Arrival, route match, mapping, validation, hooks, headers and terminal markers SHALL describe only executed stages.

#### Scenario: Middleware short circuits

- **WHEN** middleware returns without invoking its continuation
- **THEN** its inclusive span and HTTP outcome are shown without fabricated route/handler stages

### Requirement: Response lifecycle preserves semantics

HEAD and bodyless responses SHALL complete immediately. Other responses SHALL complete once on body EOF, error, cancellation, abort or shutdown without changing backpressure, bytes, headers, status or cancellation semantics. HTTP completion SHALL NOT wait for asynchronous event/job work.

#### Scenario: Streaming response pauses

- **WHEN** a response body remains open after headers
- **THEN** the request remains active until its observed body terminates, without claiming proof of remote socket delivery

### Requirement: Server RELKIT client propagation

Server-side RELKIT client calls SHALL create client spans, inject W3C headers from the active span, and finish on headers or failure without consuming the body. Browser/default client exports SHALL remain free of server runtime imports.

#### Scenario: Client is reused across requests

- **WHEN** a cached client is called under two concurrent parent spans
- **THEN** each request propagates its own current parent and global fetch is unchanged
