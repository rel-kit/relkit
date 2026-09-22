## Purpose

Defines function-backed tool exposure and bounded, validated agent execution using logical model profiles and deterministic testing rather than vendor-specific application code.

## Requirements

### Requirement: Tools are constrained function views

A tool SHALL target one function, inherit that function's input, output, and declared errors, and add description, side-effect classification, approval policy, optional timeout, optional `onBefore` and `onAfter` hooks, and its own optional or inferred identity; it SHALL NOT duplicate the target handler.

#### Scenario: Tool contract is compiled

- **WHEN** a tool references a valid function
- **THEN** its graph/API schema matches the target contracts and its invocation path resolves to that function

#### Scenario: Function creates a tool view

- **WHEN** `getOrder.asTool({ description, sideEffect, approval, onBefore, onAfter })` is exported or included in an agent
- **THEN** the resulting hooks belong to the tool view and the target function's own hooks still run through its pipeline

#### Scenario: Zero-argument tool view is created

- **WHEN** `asTool()` uses complete function tool metadata
- **THEN** it creates the tool view without copying the function's lifecycle hooks

### Requirement: Validated and allowlisted tool calls

Agent execution SHALL validate requested tool identity and JSON arguments, reject undeclared tools, apply the tool's timeout, and invoke the target through the common engine with source `tool`.

#### Scenario: Model requests unknown tool

- **WHEN** a model turn names a tool outside the agent's declared tool set
- **THEN** the runtime rejects the call without invoking any function

#### Scenario: Model supplies invalid arguments

- **WHEN** tool-call JSON violates the inherited function input schema
- **THEN** the runtime returns a safe tool error to the agent loop and records no target invocation

### Requirement: Enforced side-effect approval

Tool side effects SHALL be classified as none, read, write, or external, and approval policy SHALL be enforced as never, on-write, or always before tool hooks or target invocation from either an agent or direct `tool.invoke` call.

#### Scenario: Required approval is denied

- **WHEN** a write or external tool requires approval and the approval response is denied
- **THEN** neither tool hook nor target function is invoked and the caller receives a bounded denial result

#### Scenario: Required approval has no resolver

- **WHEN** a standalone tool invocation requires approval but no approval resolver is active
- **THEN** invocation fails closed before any hook or target function runs

### Requirement: Tool lifecycle hooks wrap target execution

Optional tool hooks SHALL transform typed target values without receiving an HTTP request and SHALL run in approval, before, target, after order.

#### Scenario: Tool succeeds

- **WHEN** an approved tool has both lifecycle hooks
- **THEN** its validated input passes through tool `onBefore`, the target function pipeline, and tool `onAfter`, with each transformed value validated against the inherited schema

#### Scenario: Tool target fails

- **WHEN** tool `onBefore` or the target function fails
- **THEN** tool `onAfter` does not run

### Requirement: Generated agent functions use the common engine

The compiler SHALL create a marked generated function identity for each agent, and all agent invocation, tool calls, cancellation, errors, and telemetry SHALL pass through the same function engine and parent/child trace model.

#### Scenario: Agent invokes a tool

- **WHEN** an agent model turn requests an allowed valid tool
- **THEN** the trace contains the generated agent function, model turn, tool call, and target function as correlated parent/child operations

### Requirement: Bounded validated agent loop

The agent runtime SHALL enforce maximum steps, maximum tool calls, total timeout, cancellation, bounded model response size, secret redaction, allowed tools, approval policy, and final output schema validation.

#### Scenario: Step limit is reached

- **WHEN** a model continues requesting turns after the declared maximum
- **THEN** execution stops with a safe limit failure and performs no further model or tool call

#### Scenario: Final output is invalid

- **WHEN** a model returns a final value outside the agent output schema
- **THEN** the invocation fails validation rather than returning untyped model data

### Requirement: Prompt and result privacy defaults

Prompt and model response content SHALL NOT be stored by default; development capture SHALL require explicit configuration and SHALL apply redaction and bounds before any in-memory, disk, terminal, API, SSE, or inspector sink.

#### Scenario: Default agent invocation is inspected

- **WHEN** an agent completes under default observability settings
- **THEN** metadata and spans are available but raw instructions, prompt content, model response, and secrets are absent

### Requirement: Deterministic fake model provider

The test provider SHALL use supported native LangChain model interfaces to script model turns, tool calls, middleware state updates, interruptions, and final outputs without network access or dependence on model prose.

#### Scenario: Scripted agent test runs

- **WHEN** a test scripts a valid native tool call followed by a final output
- **THEN** the target runs once and deterministic native and RELKIT results, state, events, and traces can be compared

### Requirement: Tools are directly invokable through their runtime

A tool descriptor SHALL expose typed `invoke(input, options?)` that applies inherited schemas, timeout, side-effect metadata, approval policy, source attribution, and common-engine target execution.

#### Scenario: Read-only tool is invoked standalone

- **WHEN** a read-only tool with `approval: "never"` receives valid input through `invoke`
- **THEN** its target function runs once through the common engine with source `tool` and returns the validated output

#### Scenario: Tool input is invalid

- **WHEN** a direct tool invocation receives input outside its inherited function schema
- **THEN** validation rejects it before approval or target execution

### Requirement: Model integrations use provider profiles

The singular model capability SHALL accept compatible native model instances or lazy factories in a named profile map; agent model selectors SHALL choose a profile while credentials, runtime instances, and provider internals remain outside descriptors and browser artifacts.

#### Scenario: Agent omits a model profile

- **WHEN** exactly one model profile exists or `defaults.model` names one
- **THEN** runtime resolves and lazily activates that native model profile

#### Scenario: Multiple model profiles are ambiguous

- **WHEN** an agent omits selection and no default resolves among multiple profiles
- **THEN** compilation fails before any model integration is activated

### Requirement: Model fakes are explicit

Deterministic scripted model providers SHALL be supplied as named test replacements and SHALL NOT be selected because runtime is in a test environment.

#### Scenario: Agent test supplies a scripted profile

- **WHEN** `createTestApplication` replaces the selected model profile
- **THEN** the agent runs deterministically without network or real credentials

### Requirement: Real agent model and tool spans

Agents, model turns, tool callbacks, parallel tool calls and approvals SHALL use the shared span lifecycle rather than synthetic summary spans. Actual callbacks SHALL execute with their corresponding span active, with manual trace API available to tool handlers.

#### Scenario: Parallel tools log

- **WHEN** two model-selected tools execute concurrently and one fails
- **THEN** each tool's logs and operations have its own active span, the failure is identifiable, and the parallel relationship is preserved

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
