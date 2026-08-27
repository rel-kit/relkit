## MODIFIED Requirements

### Requirement: One common function engine

Descriptor calls, HTTP routes, job attempts, event deliveries, tool calls, and generated agent invocations SHALL all enter the same function registration and invocation pipeline, and no descriptor, transport, provider, or standalone caller SHALL execute a handler directly.

#### Scenario: Handler is invoked from different sources

- **WHEN** the same function is triggered through `invoke`, over HTTP, and by a job
- **THEN** each invocation receives the same input/output validation, managed-dependency enforcement, error normalization, lifecycle, service policy, and telemetry semantics with only its source metadata differing

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

### Requirement: Parent and child invocation identity

Nested function descriptor calls SHALL create distinct child invocation IDs while inheriting trace, deadline, cancellation, correlation, and active service policy from the parent.

#### Scenario: Function calls function descriptor

- **WHEN** a handler awaits another function's `invoke(input)` operation
- **THEN** the resulting trace shows a child invocation with its own ID and the same trace ID without requiring `context.functions`

## ADDED Requirements

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

