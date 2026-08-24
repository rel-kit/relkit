## MODIFIED Requirements

### Requirement: Tools are constrained function views

A tool SHALL target one function, inherit that function's input, output, and declared errors, and add only a description, side-effect classification, approval policy, optional timeout, and its own optional or inferred identity; it SHALL NOT own another handler, whether created with `defineTool` or `function.asTool`.

#### Scenario: Tool contract is compiled

- **WHEN** a tool references a valid function
- **THEN** its graph/API schema matches the target function contracts and its invocation path resolves to that function

#### Scenario: Function creates a tool view

- **WHEN** `getOrder.asTool({ description, sideEffect, approval })` is exported or included in an agent
- **THEN** the result is equivalent to a `defineTool` view of `getOrder` and does not duplicate its handler

#### Scenario: Zero-argument tool view lacks metadata

- **WHEN** `asTool()` is called on a function that did not declare complete tool metadata
- **THEN** the public type contract or descriptor validation rejects it rather than guessing side-effect or approval policy

### Requirement: Enforced side-effect approval

Tool side effects SHALL be classified as none, read, write, or external, and approval policy SHALL be enforced as never, on-write, or always before target invocation from either an agent or direct `tool.invoke` call.

#### Scenario: Required approval is denied

- **WHEN** a write/external tool requires approval and the approval response is denied
- **THEN** the target function is not invoked and the caller receives a bounded denial result

#### Scenario: Required approval has no resolver

- **WHEN** a standalone tool invocation requires approval but no approval resolver is active
- **THEN** invocation fails closed before its target function runs

### Requirement: Deterministic fake model provider

The test provider SHALL use the AI SDK v7 testing surface to support scripted model turns, including tool calls and final outputs, without network access or dependence on model prose.

#### Scenario: Scripted agent test runs

- **WHEN** a test scripts a valid tool call followed by a final output
- **THEN** the expected target function runs once and the deterministic validated output and trace can be asserted

## REMOVED Requirements

### Requirement: Agents use logical model profiles

**Reason**: Per-agent logical `modelProfile` values and the custom model-provider protocol are replaced by a configured AI SDK v7 provider registry with explicit provider/model defaults.

**Migration**: Replace `modelProfile` with optional `model`, configure `defaultProvider`, `defaultModel`, and named `modelProviders`, and replace custom model providers with supported AI SDK provider adapters or AI SDK test models.

## ADDED Requirements

### Requirement: Agents use configured AI SDK models

An agent SHALL declare validated input/output, serializable instructions, allowed tools, finite step/tool/time limits, and an optional serializable model selector resolved through the active environment's AI SDK v7 provider registry; credentials and live model objects SHALL remain outside agent descriptors.

#### Scenario: Agent omits model

- **WHEN** an agent does not declare `model`
- **THEN** runtime resolution uses the configured `defaultProvider` and `defaultModel`

#### Scenario: Agent selects provider default

- **WHEN** an agent's `model` equals a configured provider name
- **THEN** runtime resolution uses that provider's declared default model or fails readiness when it has none

#### Scenario: Agent selects exact model

- **WHEN** an agent supplies an AI SDK registry ID in `provider:model` form
- **THEN** the named provider and exact model are used after configuration validation

#### Scenario: Agent embeds live model

- **WHEN** an agent attempts to store an AI SDK model instance, provider closure, or credential in its descriptor
- **THEN** authoring or compilation rejects the non-serializable value

### Requirement: Model provider defaults are explicit

Each environment's model configuration SHALL declare both `defaultProvider` and `defaultModel` plus one or more named `modelProviders`; the default provider SHALL exist, credentials SHALL use environment references, and unknown or incomplete providers SHALL fail before readiness.

#### Scenario: Defaults resolve

- **WHEN** `defaultProvider` names `openai`, `defaultModel` names a valid OpenAI model, and the OpenAI provider has a valid environment-backed API key
- **THEN** model startup creates the official provider adapter without exposing the resolved key in graph or diagnostics

#### Scenario: Default provider is absent

- **WHEN** `defaultProvider` does not name an entry in `modelProviders`
- **THEN** compilation or readiness fails with a safe configuration diagnostic before any model request

#### Scenario: Multiple providers are configured

- **WHEN** OpenAI and Anthropic provider entries are both configured
- **THEN** different agents can select either provider while an agent with no model consistently uses the two global defaults

### Requirement: AI SDK tool-loop semantics preserve ZSYS boundaries

Agent execution SHALL use AI SDK v7 tool-loop and tool contracts behind the ZSYS descriptor boundary while retaining ZSYS input/output validation, limits, approval policy, cancellation, redaction, engine invocation, and correlated telemetry.

#### Scenario: AI SDK model requests function-derived tool

- **WHEN** a model requests an allowed `function.asTool` entry with valid arguments
- **THEN** AI SDK tool validation and approval resolve before the target enters the ZSYS engine with source `tool`

#### Scenario: Prompt instructions are authored

- **WHEN** an agent declares instructions or messages
- **THEN** they remain serializable agent configuration and no separate first-class prompt descriptor is required

### Requirement: Tools are directly invokable through their runtime

A tool descriptor SHALL expose typed `invoke(input, options?)` that applies inherited schemas, timeout, side-effect metadata, approval policy, source attribution, and common-engine target execution.

#### Scenario: Read-only tool is invoked standalone

- **WHEN** a read-only tool with `approval: "never"` receives valid input through `invoke`
- **THEN** its target function runs once through the common engine with source `tool` and returns the validated output

#### Scenario: Tool input is invalid

- **WHEN** a direct tool invocation receives input outside its inherited function schema
- **THEN** validation rejects it before approval or target execution

