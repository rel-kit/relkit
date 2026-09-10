## ADDED Requirements

### Requirement: Native LangChain execution is the default agent runtime
RELKIT SHALL execute ordinary agents through supported native LangChain APIs while preserving RELKIT validation, authorization, limits, cancellation, redaction, tracing, and function-engine tool invocation.

#### Scenario: Native agent invokes a RELKIT tool
- **WHEN** a declared native model requests a valid function-backed tool
- **THEN** the target executes once through the common engine and the native agent receives the validated result

### Requirement: Native models tools and middleware require no adapter wrapper
Agent declarations SHALL accept compatible native model instances or lazy factories, native tools, and native middleware alongside RELKIT tools without public conversion helpers or an application-level runtime adapter.

#### Scenario: Todo middleware is declared
- **WHEN** an agent includes the supported native todo middleware
- **THEN** its contributed tool and state participate in the same native execution without duplicate declarations

### Requirement: Middleware state is explicitly exposed
Agent declarations SHALL allow selected native state fields to be exposed through a typed allowlist, and SHALL keep unselected native state private by default.

#### Scenario: Todo state is selected
- **WHEN** an agent selects the middleware-contributed `todos` field for its client
- **THEN** the generated client receives validated todo updates while other native state remains absent

### Requirement: One agent API supports DeepAgents capabilities
The same agent declaration SHALL support subagents, model inheritance, skills, memory files, checkpointers, stores, and compatible filesystem backends by selecting supported native DeepAgents execution when those capabilities are present.

#### Scenario: Parent delegates to a subagent
- **WHEN** an agent declares a subagent and delegates work
- **THEN** child execution is correlated under the supplied root thread with isolated native scope and aggregate limits

### Requirement: Optional native packages fail explicitly
DeepAgents, model drivers, stores, checkpointers, and backends SHALL remain optional application dependencies and missing or incompatible capabilities SHALL fail with actionable activation errors.

#### Scenario: Deep capability package is missing
- **WHEN** an application declares a DeepAgents-only capability without the required package
- **THEN** activation fails before execution and identifies the missing dependency

## MODIFIED Requirements

### Requirement: Deterministic fake model provider
The test provider SHALL use supported native LangChain model interfaces to script model turns, tool calls, middleware state updates, interruptions, and final outputs without network access or dependence on model prose.

#### Scenario: Scripted agent test runs
- **WHEN** a test scripts a valid native tool call followed by a final output
- **THEN** the target runs once and deterministic native and RELKIT results, state, events, and traces can be compared

### Requirement: Model integrations use provider profiles
The singular model capability SHALL accept compatible native model instances or lazy factories in a named profile map; agent model selectors SHALL choose a profile while credentials, runtime instances, and provider internals remain outside descriptors and browser artifacts.

#### Scenario: Agent omits a model profile
- **WHEN** exactly one model profile exists or `defaults.model` names one
- **THEN** runtime resolves and lazily activates that native model profile

#### Scenario: Multiple model profiles are ambiguous
- **WHEN** an agent omits selection and no default resolves among multiple profiles
- **THEN** compilation fails before any model integration is activated

## REMOVED Requirements

### Requirement: AI SDK tool-loop semantics preserve RELKIT boundaries
**Reason**: LangChain becomes the built-in native agent runtime, so maintaining an AI SDK execution path would duplicate semantics and weaken compatibility guarantees.

**Migration**: Replace AI SDK model integrations with native LangChain model instances or lazy factories; retain RELKIT function-backed tools directly in the agent declaration.

### Requirement: AI SDK deterministic fake model provider
**Reason**: Deterministic testing moves to native LangChain model contracts.

**Migration**: Use RELKIT’s native scripted model fixture and direct-native differential tests.

