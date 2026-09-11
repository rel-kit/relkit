## Purpose

Defines safe lifecycle, driver interoperability, durable checkpoints, long-term memory, and restart-safe human continuation for RELKIT native agent and graph execution.

## ADDED Requirements

### Requirement: Checkpoint and memory resources are distinct
RELKIT SHALL define checkpoint and memory-store resources separately from the application database, event journal, instruction files, skill directories, and filesystem backends.

#### Scenario: Agent uses checkpoint and memory resources
- **WHEN** an agent declares both resources
- **THEN** execution checkpoints and long-term memories use their respective native contracts and lifecycle

### Requirement: Compatible native drivers remain available
RELKIT SHALL accept documented memory, SQLite, PostgreSQL, MongoDB, Redis, shallow Redis, native store, and custom protocol-compatible implementations without flattening driver-specific capabilities.

#### Scenario: Custom saver is supplied
- **WHEN** an implementation satisfies the supported native saver protocol
- **THEN** RELKIT uses it without requiring a closed driver adapter list

### Requirement: Database initialization is explicit
RELKIT SHALL NOT run migrations, schema pushes, native setup, table creation, index creation, or privileged extension installation during compilation, inspection, activation, or ordinary requests.

#### Scenario: Application is inspected
- **WHEN** Inspector loads an application containing database-backed AI resources
- **THEN** no database schema or index is modified

### Requirement: Owned and borrowed resources have safe lifecycle
RELKIT SHALL dispose owned native resources and SHALL NOT close a borrowed application database client unless ownership was explicitly transferred.

#### Scenario: Borrowed PostgreSQL pool is reused
- **WHEN** an AI resource uses a compatible application-owned pool
- **THEN** RELKIT releases its own resource state without ending the borrowed pool

### Requirement: Continuation is durable and revision bound
Before exposing human input, RELKIT SHALL durably persist the native checkpoint and complete safe waiting contract; continuation SHALL validate authorization, thread, schema, snapshot revision, action binding, and idempotency before claiming execution.

#### Scenario: Process exits while waiting
- **WHEN** a worker terminates after publishing a waiting snapshot
- **THEN** another worker resumes the same native checkpoint using a valid reply and supplied thread ID

#### Scenario: Stale approval is replayed
- **WHEN** a reply targets an older waiting revision
- **THEN** it is rejected without applying to a newer action or duplicating effects

### Requirement: External effects are not falsely exactly-once
RELKIT SHALL fence workers and deduplicate accepted continuation receipts but SHALL document that replayed arbitrary external effects require application idempotency or transactions.

#### Scenario: Resume receipt is retried
- **WHEN** the same accepted continuation is submitted again
- **THEN** RELKIT returns its existing receipt and does not claim a second resumed segment

