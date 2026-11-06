# Spec Delta

## MODIFIED Requirements

### Requirement: Internal Effect execution without public leakage

Each handler SHALL execute inside a managed internal Effect fiber that provides scopes, interruption,
deadlines, typed internal failures, logging, tracing, concurrency primitives and deterministic clock
behavior. The `relkit` main entry point SHALL expose none of those Effect types, and a handler that
returns an Effect SHALL run in the same fiber with the same semantics as a Promise handler.

#### Scenario: Plain async handler executes

- **WHEN** an application handler returns a Promise
- **THEN** the engine runs it in the active generation scope and returns its validated result through
  a Promise-based public API

#### Scenario: Effect handler executes

- **WHEN** an application handler returns an Effect
- **THEN** the engine runs it in the active generation scope with the same cancellation, tracing and
  error mapping as a Promise handler

### Requirement: Descriptor invocation selects the correct engine

Calls through `ctx.functions.<name>` SHALL use the current invocation scope, calls through a runtime
handle SHALL use that handle's application, and `invokeFunction` in tests SHALL use an isolated
standalone instance of the common invocation kernel. No call SHALL fall back to a process-global
default application.

#### Scenario: Invoke runs inside an application invocation

- **WHEN** a handler calls `ctx.functions.priceOrder(input)`
- **THEN** the active generation registry, providers, hooks, parent identity, service policy,
  deadline, cancellation, and observability are reused automatically

#### Scenario: Invoke runs outside an application invocation

- **WHEN** a unit test calls `invokeFunction(fn, input)` without an active RelKit invocation
- **THEN** the standalone kernel validates input/output/errors, supplies the public
  logging/time/signal context, applies descriptor limits and bound service policy, and returns the
  typed result

#### Scenario: Standalone function needs an application provider

- **WHEN** standalone execution attempts to use a declared provider-backed dependency without a
  configured fake or runtime handle
- **THEN** invocation fails with a clear dependency-configuration error rather than selecting an
  arbitrary running application

#### Scenario: Applications execute concurrently

- **WHEN** two application runtimes invoke functions concurrently in one process
- **THEN** asynchronous invocation scope selects the correct runtime for each call with no
  process-global default-runtime leakage

### Requirement: Generated application context reflects active services

Function context SHALL expose the resolved application environment type, each Drizzle service's typed
models and transactions under `databases.<service>` with the default service also under `database`,
and the session type inferred from the application's Better Auth instance through `auth.getSession`,
without a service-context patch field.

#### Scenario: Function uses application capabilities

- **WHEN** a compiled function reads an environment key, custom database model, and authentication
  session
- **THEN** all three are statically typed and resolve from the active generation at runtime

#### Scenario: Two databases

- **WHEN** an application defines `main` and `analytics` Drizzle services and a function declares
  both
- **THEN** `ctx.databases.analytics` is typed with the analytics models and `ctx.database` refers to
  the default service
