# runtime-handle Specification

## Purpose
Defines how code outside function handlers — raw routes, middleware, startup hooks, scripts, workers
and other frameworks — uses an application's functions, databases, agents and other resources.

## Requirements

### Requirement: Handle inside a running application

`getRelkit()` SHALL return the running application's handle when called from code that executes
inside that application, including raw routes, middleware and startup hooks, and SHALL fail with a
coded error when no application is running.

#### Scenario: Middleware reads data

- **WHEN** middleware calls `getRelkit().database.orders.findMany()`
- **THEN** it reads through the running application's database service

#### Scenario: No application is running

- **WHEN** a script calls `getRelkit()` without a running application
- **THEN** it throws a coded error that points to `createRelkit`

### Requirement: Standalone handle

`createRelkit(config)` SHALL start an application handle that activates only the providers its graph
needs, and `close()` SHALL release them.

#### Scenario: Seed script

- **WHEN** a seed script creates a handle, inserts rows and closes the handle
- **THEN** the rows are committed and no listener or worker keeps running

### Requirement: Same clients as handlers

The handle SHALL expose the same typed clients as handler context — functions grouped by service,
databases, cache, buckets, events, channels, tasks, jobs and agents — with the same validation,
retries and telemetry.

#### Scenario: Function call from a script

- **WHEN** a script calls `relkit.functions.orders.priceOrder(input)`
- **THEN** input and output are validated and the call appears in traces as a `system` call

### Requirement: Isolated per application

Each handle SHALL use only its own application's runtime, and two applications in one process SHALL
NOT share state through handles.

#### Scenario: Two applications in one process

- **WHEN** handles from two different configurations run calls concurrently
- **THEN** each call uses its own application's providers and registry
