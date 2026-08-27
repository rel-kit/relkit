## Purpose

Defines the single invocation engine, internal lifecycle kernel, public context bridge, and deterministic test controls used by every RelKit execution source.

## ADDED Requirements

### Requirement: One common function engine

Direct calls, HTTP routes, job attempts, event deliveries, tool calls, and generated agent invocations SHALL all enter the same function registration and invocation pipeline, and no transport or provider SHALL execute a handler directly.

#### Scenario: Handler is invoked from different sources

- **WHEN** the same function is triggered directly, over HTTP, and by a job
- **THEN** each invocation receives the same input/output validation, dependency enforcement, error normalization, lifecycle, and telemetry semantics with only its source metadata differing

### Requirement: Graph and manifest verification before registration

The engine SHALL verify supported contract versions, graph hash equality, and a unique executable handler for every function before constructing an activatable registry.

#### Scenario: Duplicate or missing handler registration

- **WHEN** a manifest registers a function zero times or more than once
- **THEN** runtime construction fails before readiness or traffic acceptance

### Requirement: Validated invocation boundary

The engine SHALL validate input before handler admission, validate successful output before returning it, validate declared error data before exposure, and treat invalid handler output as an internal defect rather than client input failure.

#### Scenario: Invalid input arrives

- **WHEN** invocation input does not satisfy the function schema
- **THEN** the handler is not called and the caller receives the source-appropriate validation failure

#### Scenario: Handler returns invalid output

- **WHEN** a handler resolves to a value outside its declared output schema
- **THEN** the invocation is recorded as a safe unexpected defect and raw internal detail is not exposed

### Requirement: Internal Effect execution without public leakage

Each plain value/Promise handler SHALL execute inside a managed internal Effect fiber that provides scopes, interruption, deadlines, typed internal failures, logging, tracing, concurrency primitives, and deterministic clock behavior while public declarations expose none of those Effect types.

#### Scenario: Plain async handler executes

- **WHEN** an application handler returns a Promise
- **THEN** the engine runs it in the active generation scope and returns its validated result through a Promise-based public API

### Requirement: Context-preserving invocation bridge

Every public context operation SHALL attach the current invocation and trace IDs, create an appropriate child span, inherit the deadline, propagate cancellation, normalize provider failures, enforce declared dependencies, and record observed relationships.

#### Scenario: Child provider call is cancelled

- **WHEN** an invocation is interrupted while awaiting a declared provider operation
- **THEN** the provider operation receives cancellation and its child span remains correlated with the parent invocation

#### Scenario: Undeclared dependency is forged

- **WHEN** forged runtime input attempts to access a dependency not declared on the function
- **THEN** the bridge rejects access even if TypeScript checks were bypassed

### Requirement: End-to-end cancellation and deadlines

HTTP disconnects, explicit timeouts, generation draining, and shutdown SHALL interrupt the invocation fiber and abort the public `ctx.signal`; child calls SHALL inherit the earliest effective deadline and cancellation.

#### Scenario: Function timeout expires

- **WHEN** a handler exceeds its effective timeout
- **THEN** its signal is aborted, its work is interrupted, the result is classified as timeout, and bounded cleanup runs

### Requirement: Distinct safe failure categories

The runtime SHALL distinguish declared application errors, provider failures, cancellation, timeout, and unexpected defects; development telemetry MAY retain redacted diagnostic detail, but external callers SHALL receive only safe envelopes permitted by the source mapping.

#### Scenario: Unknown exception is thrown

- **WHEN** a handler throws an undeclared exception
- **THEN** the runtime records a defect with internal correlation data and returns a generic safe failure

### Requirement: Function admission and recursion policy

The engine SHALL enforce per-generation per-function concurrency before handler admission, combine function and trigger limits by using the stricter effective value, and deny direct recursion or prohibited direct-call cycles by default.

#### Scenario: Concurrency is exhausted

- **WHEN** active invocations reach the effective limit
- **THEN** later invocations wait or fail according to the documented admission policy without being counted as active prematurely

#### Scenario: Direct recursion is attempted

- **WHEN** a function directly re-enters itself or a prohibited call cycle
- **THEN** the engine rejects the invocation with a safe policy failure

### Requirement: Parent and child invocation identity

Direct function calls SHALL create distinct child invocation IDs while inheriting trace, deadline, cancellation, and correlation from the parent.

#### Scenario: Function calls declared function

- **WHEN** a handler invokes a declared function client
- **THEN** the resulting trace shows a child invocation with its own ID and the same trace ID

### Requirement: Managed generation lifecycle

Environment resolution, provider construction, handler/resource/trigger registration, internal APIs, readiness, traffic activation, draining, and provider release SHALL occur in dependency order, and shutdown SHALL stop new work before releasing resources in reverse dependency order.

#### Scenario: Provider construction fails

- **WHEN** any required generation provider fails validation, construction, capability check, or safe health check
- **THEN** the generation never becomes ready and all already acquired resources are released

### Requirement: Framework logging uses approved sinks

Framework and CLI logs SHALL enter the internal structured logging service, and direct console or process stream writes SHALL occur only inside final logger sinks.

#### Scenario: Invocation emits an application log

- **WHEN** a handler calls `ctx.log.info` with fields
- **THEN** the record receives invocation, trace, component, and redaction annotations before any configured sink sees it

### Requirement: Deterministic application test harness

`@relkit/testing` SHALL provide isolated function/runtime/application helpers with validated test environment values, deterministic IDs and clock, in-memory HTTP, controlled job/event delivery, scripted models, bucket/cache fakes, telemetry queries, named failure injection, and restart against shared test state.

#### Scenario: Test runtime is created

- **WHEN** a test creates an application runtime without requesting real time or external services
- **THEN** it receives a unique temporary directory, isolated providers and observability, deterministic IDs/time, and bounded cleanup

#### Scenario: Failed test state is retained

- **WHEN** `RELKIT_KEEP_TEST_STATE=1` is set and a test fails
- **THEN** the harness retains and reports its unique state directory for diagnosis
