## Purpose

Defines optional native jobs services with explicit deployment-specific capabilities, persistence ownership, executable workers and independently verified provider support.

## ADDED Requirements

### Requirement: TJ-008 Native state ownership

Jobs MUST NOT require a separate configured job-state service or a mandatory universal Relkit journal.

#### Scenario: Native state ownership

- **WHEN** one remote jobs service is configured
- **THEN** trigger, read and watch require no separate RELKIT database or shadow run journal

### Requirement: TJ-011 Honest retryable mode

Queue-only integrations MUST reject durable task mode when unsupported.

#### Scenario: Honest retryable mode

- **WHEN** a durable task binds to the queue-only effect-mq profile
- **THEN** activation fails; an explicitly retryable task can use its certified trigger/read subset

### Requirement: TJ-021 Native SDK reuse

Adapters MUST reuse supported native clients for submission/read/observation and MUST NOT reverse-engineer provider realtime protocols.

#### Scenario: Native SDK reuse

- **WHEN** an observer releases the last lease on a native watch
- **THEN** the supported SDK subscription, readers, listeners and timers are closed without implementing a replacement native wire protocol

### Requirement: TJ-038 Capability-checked deployment

Every advertised feature MUST be supported for the pinned SDK/backend/deployment mode and validated before activation.

#### Scenario: Capability-checked deployment

- **WHEN** a deployment requests a capability absent from its pinned SDK/backend/deployment certification
- **THEN** activation fails before accepting tasks and identifies the unsupported combination

### Requirement: TJ-043 Three provider implementations with a scoped certification gate

This new jobs-integration milestone MUST include only Inngest, Trigger.dev, and effect-mq integration implementations, Docker recipes, provider documentation and release certification. The default account-free durable recipe MUST be Inngest with persisted native dependencies; effect-mq MUST NOT inherit unsupported durable-sleep capabilities. Existing unrelated integrations and the explicitly gated legacy path SHALL remain available. This change's certification gate requires the Inngest and effect-mq local subsets; Trigger native/Docker evidence and Pulumi, AWS, and managed-cloud evidence are explicitly deferred and MUST remain not-tested rather than passed.

#### Scenario: Scoped provider certification

- **WHEN** this change is release-checked
- **THEN** Inngest and effect-mq have executable local evidence, Trigger and deferred deployment modes remain explicitly not-tested, and effect-mq durable sleep remains rejected unless separately proven

### Requirement: Every adapter deploys native executable work

An advertised adapter SHALL publish/register runnable immutable task definitions, submit/control/query accepted work, bind verified task context, and normalize observations using supported native clients. Factories alone and successful no-op operations SHALL not count as support. Native suspension SHALL bypass application failure/retry/hook normalization and return to its native engine.

Normal generated dev/start/production applications SHALL activate the same verified jobs bindings as direct scoped bootstraps. New task adapters and legacy queue adapters SHALL be distinguished even though both use the existing job capability; incompatible execution-model bindings SHALL fail before activation. API process shutdown SHALL release its owned clients without cancelling accepted native work, and repeated cleanup SHALL not close another owner's resources.

#### Scenario: Native suspension control flow

- **WHEN** a supported SDK parks a sleep-capable handler
- **THEN** the run remains sleeping/continuing rather than failed or completed

#### Scenario: Submission-only adapter

- **WHEN** an integration can send an event but cannot deploy its target task
- **THEN** the integration fails certification

#### Scenario: Legacy provider is selected for a task-backed job

- **WHEN** a new task job selects a provider implementing only legacy queue materialization
- **THEN** activation reports an execution-model capability mismatch before starting a worker or accepting input

#### Scenario: Generated API process stops

- **WHEN** a packed generated application's API process stops while native work remains accepted
- **THEN** its submission/watch clients close and the independently deployed task continues with native recovery and retained state

### Requirement: Capabilities are per deployment and backed by native evidence

Reports SHALL identify provider, SDK/backend/runtime/deployment versions, feature support native/adapter/unsupported/unverified, constraints/limits and passing test evidence. Unverified SHALL not be advertised as production support. Acceptance, retry scope/backoff, sleep, clocks, resources, concurrency, cancel finality, duplicate receipts, version routing, progress/streams/history, scoped filters and recurrence policies SHALL be independently checked.

#### Scenario: Docker differs from cloud

- **WHEN** managed and Docker modes expose different checkpoint or resource behavior
- **THEN** their reports differ and incompatible task requirements fail preflight

#### Scenario: Peer incompatibility

- **WHEN** the chosen effect-mq package requires an incompatible Effect peer
- **THEN** compatibility fails before installation/activation is treated as supported
