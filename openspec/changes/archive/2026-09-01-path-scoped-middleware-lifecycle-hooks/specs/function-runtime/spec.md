## MODIFIED Requirements

### Requirement: Validated invocation boundary

The engine SHALL validate input before `onBefore`, validate the value returned by `onBefore` before handler admission, validate handler output before `onAfter`, validate the value returned by `onAfter` before returning it, validate declared error data before exposure, and treat invalid handler or hook output as an internal defect rather than client input failure.

#### Scenario: Invalid input arrives

- **WHEN** invocation input does not satisfy the function schema
- **THEN** no hook or handler is called and the caller receives the source-appropriate validation failure

#### Scenario: Before hook returns invalid input

- **WHEN** `onBefore` resolves to a value outside the declared input schema
- **THEN** the handler is not called and the invocation is recorded as a safe unexpected defect

#### Scenario: Handler returns invalid output

- **WHEN** a handler resolves to a value outside its declared output schema
- **THEN** `onAfter` is not called and the invocation is recorded as a safe unexpected defect

#### Scenario: After hook returns invalid output

- **WHEN** `onAfter` resolves to a value outside the declared output schema
- **THEN** the invocation is recorded as a safe unexpected defect and raw internal detail is not exposed

## ADDED Requirements

### Requirement: Function lifecycle hooks use the common engine

Optional function `onBefore` and `onAfter` hooks SHALL run once within the owning function invocation, use its context and declared dependencies, and apply for every invocation source.

#### Scenario: Successful service member invocation

- **WHEN** a service member with both hooks completes successfully
- **THEN** execution order is service-before, function-before, handler, function-after, service-after

#### Scenario: Function execution fails

- **WHEN** `onBefore` or the handler fails
- **THEN** `onAfter` does not run and the common engine normalizes the failure
