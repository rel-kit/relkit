## ADDED Requirements

### Requirement: Generated templates teach service composition

The non-minimal generated templates SHALL demonstrate the revised authoring model using public APIs, inferred source-scoped IDs, service members, and direct function invocation without retaining legacy `context.functions` examples.

#### Scenario: API template is generated

- **WHEN** a developer creates the API template
- **THEN** its route targets a service member, its nested function call uses `target.invoke(input)`, and its checks compile without function dependency declarations

#### Scenario: Minimal template is generated

- **WHEN** a developer creates the minimal template
- **THEN** it remains a small single-function example and does not acquire speculative service, agent, or event scaffolding

### Requirement: Agent template derives a tool from a function

The agent template SHALL expose one useful function through `asTool`, configure both `defaultProvider` and `defaultModel` with named model providers, use deterministic AI SDK test models outside production, and avoid a duplicate tool handler or wrapper module.

#### Scenario: Agent project is generated

- **WHEN** the generated agent handles a request that needs its tool
- **THEN** the AI SDK tool loop invokes the original function once through the common engine and the generated tests assert its validated result and trace

### Requirement: API template explains independent event fan-out

The API template SHALL include one small domain event published after a successful operation and at least two independently testable listeners with distinct responsibilities, and its documentation SHALL state at-least-once and independent-failure semantics without implying a transaction or simultaneous execution.

#### Scenario: Template event is published

- **WHEN** the example publishes its domain event
- **THEN** both listeners become eligible, one listener's failure cannot roll back the other's success, and deterministic tests can deliver and inspect each listener separately

