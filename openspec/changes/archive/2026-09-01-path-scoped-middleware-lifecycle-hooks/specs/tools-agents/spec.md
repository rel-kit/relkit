## MODIFIED Requirements

### Requirement: Tools are constrained function views

A tool SHALL target one function, inherit that function's input, output, and declared errors, and add description, side-effect classification, approval policy, optional timeout, optional `onBefore` and `onAfter` hooks, and its own optional or inferred identity; it SHALL NOT duplicate the target handler.

#### Scenario: Tool contract is compiled

- **WHEN** a tool references a valid function
- **THEN** its graph/API schema matches the target contracts and its invocation path resolves to that function

#### Scenario: Function creates a configured tool view

- **WHEN** `getOrder.asTool({ description, sideEffect, approval, onBefore, onAfter })` is exported or included in an agent
- **THEN** the resulting hooks belong to the tool view and the target function's own hooks still run through its pipeline

#### Scenario: Zero-argument tool view is created

- **WHEN** `asTool()` uses complete function tool metadata
- **THEN** it creates the tool view without copying the function's lifecycle hooks

### Requirement: Enforced side-effect approval

Tool side effects SHALL be classified as none, read, write, or external, and approval policy SHALL be enforced as never, on-write, or always before tool hooks or target invocation from either an agent or direct `tool.invoke` call.

#### Scenario: Required approval is denied

- **WHEN** a write or external tool requires approval and the approval response is denied
- **THEN** neither tool hook nor target function is invoked and the caller receives a bounded denial result

#### Scenario: Required approval has no resolver

- **WHEN** a standalone tool invocation requires approval but no approval resolver is active
- **THEN** invocation fails closed before any hook or target function runs

## ADDED Requirements

### Requirement: Tool lifecycle hooks wrap target execution

Optional tool hooks SHALL transform typed target values without receiving an HTTP request and SHALL run in approval, before, target, after order.

#### Scenario: Tool succeeds

- **WHEN** an approved tool has both lifecycle hooks
- **THEN** its validated input passes through tool `onBefore`, the target function pipeline, and tool `onAfter`, with each transformed value validated against the inherited schema

#### Scenario: Tool target fails

- **WHEN** tool `onBefore` or the target function fails
- **THEN** tool `onAfter` does not run
