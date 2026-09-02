## Purpose

Defines the single invocation engine, internal lifecycle kernel, public context bridge, and deterministic test controls used by every RelKit execution source.

## Requirements

### Requirement: One common function engine

Descriptor calls, HTTP routes, job attempts, event deliveries, tool calls, and generated agent invocations SHALL all enter the same function registration and invocation pipeline, and no descriptor, transport, provider, or standalone caller SHALL execute a handler directly.

#### Scenario: Handler is invoked from different sources

- **WHEN** the same function is triggered through `invoke`, over HTTP, and by a job
- **THEN** each invocation receives the same input/output validation, managed-dependency enforcement, error normalization, lifecycle, service policy, and telemetry semantics with only its source metadata differing

### Requirement: Graph and manifest verification before registration

The engine SHALL verify supported contract versions, graph hash equality, and a unique executable handler for every function before constructing an activatable registry.

#### Scenario: Duplicate or missing handler registration

- **WHEN** a manifest registers a function zero times or more than once
- **THEN** runtime construction fails before readiness or traffic acceptance

### Requirement: Validated invocation boundary

The engine SHALL validate input before `onBefore`, validate the value returned by `onBefore` before handler admission, validate handler output before `onAfter`, validate the value returned by `onAfter` before returning it, validate declared error data before exposure, and treat invalid handler or hook output as an internal defect rather than client input failure.

#### Scenario: Invalid input arrives

- **WHEN** invocation input does not satisfy the function schema
- **THEN** no hook or handler is called and the caller receives the source-appropriate validation failure

#### Scenario: Before hook returns invalid input

- **WHEN** `onBefore` resolves to a value outside the declared input schema
- **THEN** the handler is not called and the invocation is recorded as a safe unexpected defect

#### Scenario: Handler returns invalid output

- **WHEN** a handler resolves to a value outside its declared output schema
- **THEN** `onAfter` is not called and the invocation is recorded as a safe unexpected defect

#### Scenario: After hook returns invalid output

- **WHEN** `onAfter` resolves to a value outside the declared output schema
- **THEN** the invocation is recorded as a safe unexpected defect and raw internal detail is not exposed

### Requirement: Function lifecycle hooks use the common engine

Optional function `onBefore` and `onAfter` hooks SHALL run once within the owning function invocation, use its context and declared dependencies, and apply for every invocation source.

#### Scenario: Successful service member invocation

- **WHEN** a service member with both hooks completes successfully
- **THEN** execution order is service-before, function-before, handler, function-after, service-after

#### Scenario: Function execution fails

- **WHEN** `onBefore` or the handler fails
- **THEN** `onAfter` does not run and the common engine normalizes the failure

### Requirement: Internal Effect execution without public leakage

Each plain value/Promise handler SHALL execute inside a managed internal Effect fiber that provides scopes, interruption, deadlines, typed internal failures, logging, tracing, concurrency primitives, and deterministic clock behavior while public declarations expose none of those Effect types.

#### Scenario: Plain async handler executes

- **WHEN** an application handler returns a Promise
- **THEN** the engine runs it in the active generation scope and returns its validated result through a Promise-based public API

### Requirement: Context-preserving invocation bridge

Every public managed-resource operation and nested descriptor invocation SHALL attach the current invocation and trace IDs, create an appropriate child span, inherit the deadline, propagate cancellation, normalize failures, enforce declarations for provider-backed dependencies, and record observed relationships; function-to-function descriptor calls SHALL NOT require a declaration.

#### Scenario: Child provider call is cancelled

- **WHEN** an invocation is interrupted while awaiting a declared provider operation
- **THEN** the provider operation receives cancellation and its child span remains correlated with the parent invocation

#### Scenario: Undeclared managed dependency is forged

- **WHEN** forged runtime input attempts to access a job, event, bucket, cache, or agent dependency not declared on the function
- **THEN** the bridge rejects access even if TypeScript checks were bypassed

#### Scenario: Function descriptor is invoked

- **WHEN** a handler invokes an imported function descriptor that was not repeated in its dependency map
- **THEN** the bridge resolves the descriptor through the active function registry and records the child call

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

Nested function descriptor calls SHALL create distinct child invocation IDs while inheriting trace, deadline, cancellation, correlation, and active service policy from the parent.

#### Scenario: Function calls function descriptor

- **WHEN** a handler awaits another function's `invoke(input)` operation
- **THEN** the resulting trace shows a child invocation with its own ID and the same trace ID without requiring `context.functions`

### Requirement: Managed generation lifecycle

Environment resolution, graph-required binding construction, handler/resource/trigger registration, internal APIs, readiness, traffic activation, draining, and binding release SHALL occur in dependency order, and shutdown SHALL stop new work before releasing acquired bindings in reverse order. Failure of one binding SHALL not construct or expose unrelated bindings.

#### Scenario: Provider construction fails

- **WHEN** a required bucket binding fails validation or connectivity
- **THEN** the generation never becomes ready, acquired bindings are released, and cache, jobs, events, models, and observability credentials are not supplied to it

### Requirement: Framework logging uses approved sinks

Framework and CLI logs SHALL enter the internal structured logging service, and direct console or process stream writes SHALL occur only inside final logger sinks.

#### Scenario: Invocation emits an application log

- **WHEN** a handler calls `ctx.log.info` with fields
- **THEN** the record receives invocation, trace, component, and redaction annotations before any configured sink sees it

### Requirement: Descriptor invocation selects the correct engine

Function `invoke(input)` SHALL use the current asynchronous RELKIT invocation scope when present and SHALL otherwise execute through an isolated standalone instance of the common invocation kernel.

#### Scenario: Invoke runs inside an application invocation

- **WHEN** a handler calls another function descriptor
- **THEN** the active generation registry, providers, hooks, parent identity, service policy, deadline, cancellation, and observability are reused automatically

#### Scenario: Invoke runs outside an application invocation

- **WHEN** ordinary code or a unit test calls a function descriptor without an active RELKIT invocation
- **THEN** the standalone kernel validates input/output/errors, supplies the public logging/time/signal context, applies descriptor limits and bound service policy, and returns the typed result

#### Scenario: Standalone function needs an application provider

- **WHEN** standalone execution attempts to use a declared provider-backed dependency without a configured standalone runtime
- **THEN** invocation fails with a clear dependency-configuration error rather than selecting an arbitrary running application

#### Scenario: Applications execute concurrently

- **WHEN** two application runtimes invoke functions concurrently in one process
- **THEN** asynchronous invocation scope selects the correct runtime for each call with no process-global default-runtime leakage

### Requirement: Dynamic invocation cycles are bounded at runtime

The engine SHALL track the active descriptor invocation chain and reject direct recursion and prohibited dynamic cycles before admitting the repeated target, regardless of whether a static call relationship exists in the canonical graph.

#### Scenario: Dynamic two-function cycle occurs

- **WHEN** function A invokes function B and B attempts to invoke A in the same active chain
- **THEN** the repeated invocation is rejected as a safe recursion-policy failure and no unbounded stack or invocation loop is created

### Requirement: Dynamic function calls produce observed edges

Each successful attempt to invoke one function descriptor from another SHALL emit an observed `calls-function` relationship without mutating the canonical graph or requiring a declared function edge.

#### Scenario: Direct descriptor call completes

- **WHEN** `getOrder` invokes `getProduct`
- **THEN** telemetry and the inspector can show the caller, callee, parent/child invocations, and service identities while the application graph hash remains unchanged

### Requirement: Specialized services share the managed generation lifecycle

Runtime startup SHALL resolve environment values, activate the sole Drizzle service once, activate the sole Better Auth service after its database and route metadata are available, and SHALL not report readiness until providers and specialized services are ready.

#### Scenario: Database startup fails

- **WHEN** the lazy Drizzle client factory rejects
- **THEN** the generation remains not ready, application traffic is not admitted, and no disposal callback is invoked for the failed activation

#### Scenario: Generation shuts down

- **WHEN** an activated generation drains and stops
- **THEN** the Drizzle disposal callback runs at most once and failure does not prevent remaining cleanup attempts

### Requirement: Generated application context reflects active services

Function context SHALL expose the resolved application environment type, the Drizzle service's typed database models and transactions, and the Better Auth service's inferred session through `auth.getSession` without a service-context patch field.

#### Scenario: Function uses application capabilities

- **WHEN** a compiled function reads an environment key, custom database model, and authentication session
- **THEN** all three are statically typed and resolve from the active generation at runtime

### Requirement: Event functions are enforced event-only functions

Event functions SHALL use the common function engine with `invocationMode: "event-only"`, SHALL accept only event delivery or replay sources, and SHALL reject direct, nested, HTTP, service, job, schedule, tool, agent, conversion, or forged-reference invocation paths at type, compilation, registration, and runtime boundaries.

#### Scenario: Event delivery invokes an event function

- **WHEN** a provider delivers or replays the configured event
- **THEN** the common engine validates the payload, supplies event delivery context, and accepts a successful void result or declared error result

#### Scenario: Non-event path targets an event function

- **WHEN** any callable or trigger path other than event delivery/replay targets an event-only function
- **THEN** the nearest trusted boundary rejects it without running the handler

### Requirement: Publication clients are explicitly narrowed

Normal and event functions SHALL receive event publisher clients only for unique known IDs declared in `publishes`, and runtime access SHALL enforce the same permission when static typing is bypassed.

#### Scenario: Event function republishes its consumed event

- **WHEN** an event function lists its consumed event in `publishes`
- **THEN** the matching context client is available and publishes with preserved invocation causation

#### Scenario: Consumed event is not declared for publication

- **WHEN** an event function does not list its consumed event in `publishes`
- **THEN** that event is absent from its typed context and runtime access is rejected

### Requirement: Runtime resolves only required static integrations

Generation startup SHALL validate the complete activation fingerprint, resolve binding-local configuration by the provider precedence contract, load only graph-required statically planned integrations, construct each selected binding once, and preserve readiness, cancellation, draining, and reverse-order release.

#### Scenario: Unused binding is misconfigured

- **WHEN** the graph does not require that binding
- **THEN** its integration is not imported or constructed and its missing values do not affect readiness

#### Scenario: Integration identity differs at runtime

- **WHEN** a loaded module reports metadata inconsistent with its plan entry
- **THEN** the generation never becomes ready and already acquired bindings are released

### Requirement: Test provider behavior is explicit

`@relkit/testing` SHALL apply only provider replacements named by capability and profile, and ordinary production registry behavior SHALL be identical regardless of environment-name strings.

#### Scenario: Required real binding lacks a replacement

- **WHEN** a test application requires a configured binding that cannot start and no fake is supplied
- **THEN** test startup fails with the binding identity instead of silently substituting an in-memory provider
