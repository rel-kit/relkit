## ADDED Requirements

### Requirement: Public trace namespace

Function and authored-middleware contexts, including tool/event/job handlers, SHALL expose ctx.trace.span(name, callback), span(name, options, callback), event(name, attributes) and setAttributes(attributes). Span SHALL return a Promise preserving callback results/errors and activate its child context. Attributes SHALL accept only strings, finite numbers and booleans; custom kind SHALL default to internal with optional client. Reserved framework identity SHALL be immutable.

#### Scenario: No recording context exists

- **WHEN** code invokes the trace API without recording context
- **THEN** span still runs the callback exactly once and metadata methods are no-ops

#### Scenario: Span already completed

- **WHEN** retained asynchronous code attempts to mutate a completed span
- **THEN** its final metadata remains unchanged
