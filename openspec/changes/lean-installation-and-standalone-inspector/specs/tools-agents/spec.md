## MODIFIED Requirements

### Requirement: Native LangChain execution is the default agent runtime

Selected ordinary agents SHALL execute through the explicitly installed @relkit/langchain integration and supported native APIs, preserving RELKIT validation, authorization, limits, cancellation, redaction, tracing and common-engine tool invocation. Generic authoring and non-agent applications SHALL NOT install or evaluate that execution stack.

#### Scenario: Native agent invokes a RELKIT tool

- **WHEN** a declared native model requests a valid function-backed tool
- **THEN** the target executes once through the common engine and the native agent receives the validated result

### Requirement: Native models tools and middleware require no adapter wrapper

The explicit agent integration SHALL accept compatible native model instances or lazy factories, native tools and middleware alongside RELKIT tools without redundant runtime registration or an application-level adapter. Intrinsically SDK-native helpers and types SHALL belong to that integration; generic declarations SHALL remain SDK-independent.

#### Scenario: Todo middleware is declared

- **WHEN** an agent includes the supported native todo middleware
- **THEN** its contributed tool and state participate in the same native execution without duplicate declarations

### Requirement: Deterministic fake model provider

The explicitly selected agent testing provider SHALL use supported native LangChain model interfaces to script model turns, tool calls, middleware state updates, interruptions, and final outputs without network access or dependence on model prose.

#### Scenario: Scripted agent test runs

- **WHEN** a test scripts a valid native tool call followed by a final output
- **THEN** the target runs once and deterministic native and RELKIT results, state, events, and traces can be compared

#### Scenario: General testing is installed
- **WHEN** a consumer uses only the general harness
- **THEN** it does not install the native model stack, while explicit agent-testing fixtures retain deterministic native model evidence

### Requirement: One agent API supports DeepAgents capabilities

The same agent declaration SHALL support subagents, model inheritance, skills, memory files, checkpointers, stores, and compatible filesystem backends by selecting supported native DeepAgents execution when those capabilities are present.

#### Scenario: Parent delegates to a subagent

- **WHEN** an agent declares a subagent and delegates work
- **THEN** child execution is correlated under the supplied root thread with isolated native scope and aggregate limits

#### Scenario: Ordinary agent has no DeepAgents feature
- **WHEN** an agent selects no DeepAgents-only capability
- **THEN** DeepAgents is neither required nor loaded

### Requirement: Optional native packages fail explicitly

LangChain/LangGraph/LangSmith execution requirements, DeepAgents, model drivers, stores, checkpointers and backends SHALL be owned by selected capabilities. Missing or incompatible selected requirements SHALL fail before readiness using shared dependency diagnostics; installed-module failures SHALL retain original causes.

#### Scenario: Deep capability package is missing

- **WHEN** an application declares a DeepAgents-only capability without the required package
- **THEN** activation fails before execution and identifies the missing dependency

## ADDED Requirements

### Requirement: Agent state contracts do not install execution
Shared state contracts SHALL remain below native execution implementations. Redis cache/realtime and generic local cache/bucket/jobs SHALL register only selected capabilities and SHALL NOT require agent SDKs. Selected agents SHALL preserve streaming, tools, persistence, state identity, interruption/resume, durable versions, retries and cancellation.

#### Scenario: Cache-only consumer runs
- **WHEN** packed Redis-cache-only and generic local-provider fixtures run without LangChain, LangGraph, LangSmith or DeepAgents
- **THEN** their selected resources work without attempting agent registration

#### Scenario: Explicit agent resumes persisted work
- **WHEN** an interrupted selected native agent restarts against its supported existing state
- **THEN** thread/state identity, durable version routing, limits, tool execution and cancellation semantics remain unchanged
