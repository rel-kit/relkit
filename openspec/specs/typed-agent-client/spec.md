# typed-agent-client Specification

## Purpose

Defines generated, framework-independent agent and graph clients with complete scoped streaming, explicit business thread identity, typed continuation, public state, and transport equivalence.

## Requirements

### Requirement: Execution calls require caller thread identity

Generated agent and graph clients SHALL require a caller-supplied thread ID on every run, observe, stop, steer, follow-up, and resume operation and SHALL use it as native thread identity across segments.

#### Scenario: Initial execution omits thread ID

- **WHEN** application code attempts to run an agent without a thread ID
- **THEN** generated types reject the call and the runtime has no fallback thread selection

### Requirement: Initial and continuation inputs are distinct

The generated client SHALL expose separate typed overloads for initial input and `run(reply, { threadId, resume: true })`, with the live waiting snapshot enforced again at runtime.

#### Scenario: Boolean pause receives text

- **WHEN** a boolean waiting contract receives `"yes"`
- **THEN** client or server validation rejects it without interpreting its meaning

### Requirement: Public agent state is typed and validated

The generated client SHALL expose selected native state as `values`, final schema output as `output`, and normalized messages, tools, progress, waiting state, and events as distinct typed fields.

#### Scenario: Todo middleware updates state

- **WHEN** native middleware commits a todo replacement before completion
- **THEN** `values.todos` updates with its inferred status union while `output` remains unset

### Requirement: One canonical event pipeline serves every consumer

Each native execution SHALL produce one authorized, redacted, durable event sequence for the HTTP iterator, AG-UI SSE, WebSocket, snapshots, replay, generated clients, and Inspector without executing the agent twice.

#### Scenario: Same run uses different transports

- **WHEN** equivalent deterministic runs are observed through each supported transport
- **THEN** their public state, lifecycle, output, nesting, and causal relationships reduce to equivalent results

### Requirement: Event coverage preserves native scope and semantics

The event contract SHALL cover root and nested lifecycle, messages and supported content, model usage, tool arguments/execution/results, nodes/tasks/attempts, branches/joins/loops, subagents, checkpoints, public state, partial/final output, waiting/resume, cancellation, errors, and declared custom events.

#### Scenario: Child completes before root

- **WHEN** a nested subagent completes while its parent continues
- **THEN** the child scope closes without marking the root execution complete

### Requirement: Replay and reconnect are safe

Clients SHALL apply live events, snapshots, and replay idempotently with explicit cursor-gap recovery, bounded buffering, and no silent loss of terminal, state, or human-input events.

#### Scenario: Browser reconnects during todo execution

- **WHEN** a browser reconnects after missing state events
- **THEN** it restores the authorized current list once and continues without duplicated items

### Requirement: Private runtime data never reaches generated clients

Generated frontend artifacts and public events SHALL exclude native runtime instances, credentials, hidden reasoning, system prompts, private state, unrestricted provider payloads, and raw checkpoints.

#### Scenario: Public bundle is scanned

- **WHEN** generated client and Inspector browser bundles are examined
- **THEN** they contain no LangChain runtime, database driver, provider credential, or private checkpoint object

### Requirement: Generic client entrypoints do not require frontend bindings
Root and server client entrypoints SHALL install and typecheck without React, TanStack or @orpc/tanstack-query packages or types. Frontend integrations SHALL be optional and isolated at their explicit entrypoints. DefaultContractRegistry augmentation authority, generated inference and existing runtime support boundaries SHALL be preserved.

#### Scenario: Server consumer compiles a generated client
- **WHEN** a packed server fixture uses generated contracts with skipLibCheck false and no frontend dependencies
- **THEN** correct calls infer their current types, invalid calls fail and no frontend declaration needs resolution

#### Scenario: Frontend bindings are explicitly selected
- **WHEN** a consumer installs the documented peers and imports the React or TanStack entrypoint
- **THEN** existing typed interaction, observation, cleanup and supported rendering behavior remains available

### Requirement: Diagnostic inspection does not change durable client streams
Optional inspection, bounded diagnostic capture and unavailable UI/store SHALL NOT alter agent/job execution identity, authorization, durable event replay, cancellation or continuation contracts.

#### Scenario: Inspector disconnects during an interrupted agent run
- **WHEN** the tool disconnects or drops diagnostic records while a typed client observes and resumes authorized work
- **THEN** the same thread/run and durable event semantics remain valid and tool closure does not cancel the work
