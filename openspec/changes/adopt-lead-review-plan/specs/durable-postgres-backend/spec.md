# Spec Delta

## Purpose

Defines the Postgres-backed provider for durable jobs, events and schedules that production
deployments use so state survives restarts and is shared between instances.

## ADDED Requirements

### Requirement: Durable jobs on Postgres

The Postgres backend SHALL store jobs durably, lease each run to one worker at a time, retry with the
declared policy and move exhausted runs to a dead-letter state.

#### Scenario: Worker stops mid-run

- **WHEN** a worker stops while it holds a lease
- **THEN** the lease expires and another worker retries the run under the declared policy

### Requirement: Durable events on Postgres

Published events SHALL be stored in Postgres and delivered at least once to every consumer, with
retries tracked independently per consumer.

#### Scenario: One consumer fails

- **WHEN** one consumer of an event fails and another succeeds
- **THEN** only the failed consumer's delivery is retried

### Requirement: Transactional outbox

An event published inside a database transaction SHALL be committed or discarded together with that
transaction's writes.

#### Scenario: Transaction rolls back

- **WHEN** a handler publishes an event inside a transaction that then rolls back
- **THEN** no consumer receives the event

### Requirement: One run per schedule occurrence

Each schedule occurrence SHALL enqueue exactly one run across every running instance.

#### Scenario: Two instances are running

- **WHEN** two instances are running when a schedule is due
- **THEN** exactly one run is enqueued for that occurrence

### Requirement: State survives restarts and scaling

Jobs, events and schedules SHALL survive process restarts and redeploys and SHALL be shared between
instances.

#### Scenario: All instances are replaced

- **WHEN** every instance is replaced during a redeploy
- **THEN** pending jobs and undelivered events are processed by the new instances

### Requirement: Conformance

The Postgres backend SHALL pass the shared jobs and events conformance suites and their
fault-injection tests.

#### Scenario: Conformance run

- **WHEN** the conformance suites run against the Postgres backend
- **THEN** every case passes
