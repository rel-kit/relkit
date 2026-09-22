## ADDED Requirements

### Requirement: Worker context is recreated and existing module owners remain authoritative

Tasks SHALL recreate safe registered database/auth/constants/prompts and declared agents/events/buckets/cache clients in their worker generation. Original request objects, transactions, sessions, cookies and secrets SHALL not be serialized to delayed work. Function calls and events may repeat on task replay; accepted child triggers SHALL remain independent. Agent continuation and checkpoint ownership SHALL remain in the existing agent subsystem.

#### Scenario: Task resumes after two days

- **WHEN** the original HTTP process and database transaction no longer exist
- **THEN** the task has fresh worker-safe clients and its original accepted canonical input

#### Scenario: Agent tool triggers background work

- **WHEN** an approved function tool validates and triggers a task
- **THEN** it returns a handle while retaining tool approval and configured service/resource policy

## MODIFIED Requirements

### Requirement: One common function engine

Callable descriptors, HTTP routes, explicitly legacy function-target job attempts, event deliveries, tool calls and generated function-based agent invocations SHALL retain the same function pipeline. Task-backed jobs SHALL enter a distinct task execution lifecycle sharing context/validation/trace primitives but SHALL NOT be disguised as function invocations or bypass their task engine. A function invoked by a task SHALL still use normal function validation and policies without checkpointing.

#### Scenario: Handler is invoked from different sources

- **WHEN** the same function is triggered through `invoke`, over HTTP, and by an explicitly legacy function-target job
- **THEN** each invocation receives the same input/output validation, managed-dependency enforcement, error normalization, lifecycle, service policy, and telemetry semantics with only its source metadata differing

### Requirement: Context-preserving invocation bridge

Managed-resource operations and nested descriptor invocation SHALL attach current identity/trace, propagate caller cancellation/deadline to the operation, normalize failures, enforce declared managed aliases and record observed relationships. Direct function calls SHALL need no declaration. Direct task/job submission SHALL resolve within active invocation-local jobs bindings with the same security/validation policy as declared context submission. Accepted tasks SHALL detach from the caller signal/deadline and use worker lifetime.

#### Scenario: Child provider call is cancelled

- **WHEN** an invocation is interrupted while awaiting a declared provider operation
- **THEN** the provider operation receives cancellation and its child span remains correlated with the parent invocation

#### Scenario: Undeclared managed dependency is forged

- **WHEN** forged runtime input attempts to access a task, job, event, bucket, cache, or agent dependency not declared on the function
- **THEN** the bridge rejects access even if TypeScript checks were bypassed

#### Scenario: Function descriptor is invoked

- **WHEN** a handler invokes an imported function descriptor that was not repeated in its dependency map
- **THEN** the bridge resolves the descriptor through the active function registry and records the child call
