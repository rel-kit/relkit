## Purpose

Defines function-backed tool exposure and bounded, validated agent execution using logical model profiles and deterministic testing rather than vendor-specific application code.

## ADDED Requirements

### Requirement: Tools are constrained function views

A tool SHALL target one function, inherit that function's input, output, and declared errors, and add only a description, side-effect classification, approval policy, and optional timeout; it SHALL NOT own another handler.

#### Scenario: Tool contract is compiled

- **WHEN** a tool references a valid function
- **THEN** its graph/API schema matches the target function contracts and its invocation path resolves to that function

### Requirement: Validated and allowlisted tool calls

Agent execution SHALL validate requested tool identity and JSON arguments, reject undeclared tools, apply the tool's timeout, and invoke the target through the common engine with source `tool`.

#### Scenario: Model requests unknown tool

- **WHEN** a model turn names a tool outside the agent's declared tool set
- **THEN** the runtime rejects the call without invoking any function

#### Scenario: Model supplies invalid arguments

- **WHEN** tool-call JSON violates the inherited function input schema
- **THEN** the runtime returns a safe tool error to the agent loop and records no target invocation

### Requirement: Enforced side-effect approval

Tool side effects SHALL be classified as none, read, write, or external, and approval policy SHALL be enforced as never, on-write, or always before target invocation.

#### Scenario: Required approval is denied

- **WHEN** a write/external tool requires approval and the approval response is denied
- **THEN** the target function is not invoked and the agent receives a bounded denial result

### Requirement: Agents use logical model profiles

An agent SHALL declare validated input/output, logical model profile, instructions, allowed tools, and finite step/tool/time limits; vendor/model credentials and live clients SHALL remain in the global provider configuration.

#### Scenario: Model profile is unresolved

- **WHEN** an agent refers to a logical model profile absent from the active provider set
- **THEN** compilation or readiness fails before an agent invocation can start

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

The test provider SHALL support scripted model turns, including tool calls and final outputs, without network access or dependence on model prose.

#### Scenario: Scripted agent test runs

- **WHEN** a test scripts a valid tool call followed by a final output
- **THEN** the expected target function runs once and the deterministic validated output and trace can be asserted
