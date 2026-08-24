## ADDED Requirements

### Requirement: Simplified authoring has layered acceptance evidence

The repository SHALL provide type, unit, compiler, runtime, HTTP, template, documentation, and packaged-product evidence for services, inferred IDs, structured requests, descriptor invocation, function-derived tools, retry hints, and AI SDK v7 integration without requiring cloud credentials or paid model calls.

#### Scenario: Public declarations are checked

- **WHEN** type fixtures compile
- **THEN** service members, `function.invoke`, `function.asTool`, `tool.invoke`, optional IDs, structured request parameters, error retry forms, and agent model selectors infer their intended types while unsafe or ambiguous forms fail

#### Scenario: Compiler fixtures run twice

- **WHEN** fixtures with inferred IDs and services compile in shuffled order and different roots
- **THEN** IDs, graph, manifest, OpenAPI tags, diagnostics, generated clients, and hashes are deterministic, and collision fixtures fail with both source locations

#### Scenario: Invocation matrix runs

- **WHEN** one function is invoked standalone, from another function, over HTTP, by a job/event, and as a tool
- **THEN** validation, errors, limits, service middleware, context isolation, parent/child traces, dynamic edges, cycle rejection, and cleanup satisfy the same common-engine contract

#### Scenario: AI matrix runs offline

- **WHEN** OpenAI and Anthropic configuration, default resolution, exact model selection, tool calls, approvals, invalid output, cancellation, and limits are tested
- **THEN** official AI SDK test doubles provide deterministic evidence with no network or resolved secret in any artifact

### Requirement: Generated and migrated applications prove the new workflow

Generated minimal, API, and agent projects plus the canonical commerce example SHALL pass their documented check/test/build paths, and migration evidence SHALL cover every removed public pattern.

#### Scenario: Templates are packed and generated

- **WHEN** packed CLI artifacts generate all templates in isolated temporary roots
- **THEN** the minimal project stays minimal, the API project proves service/event fan-out, and the agent project proves `asTool` and both model defaults using only packed public artifacts

#### Scenario: Legacy authoring is scanned

- **WHEN** migration verification scans public examples, templates, and documentation
- **THEN** no active example uses `context.functions`, required IDs on eligible source-scoped descriptors, `modelProfile`, the custom `ModelProvider`, or the handwritten OpenAI protocol adapter

