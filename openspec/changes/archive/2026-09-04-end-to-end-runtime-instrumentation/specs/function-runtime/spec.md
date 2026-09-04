## ADDED Requirements

### Requirement: Complete invocation span

Each invocation SHALL have one span covering validation, admission, context construction, hooks, handler, output validation and normalized outcome, completed before lease release. Explicit parents SHALL take precedence, otherwise deepest active execution context and caller invocation identity SHALL be inherited. HTTP and consumer spans SHALL NOT receive fabricated invocation IDs.

#### Scenario: Input fails validation

- **WHEN** an invocation fails before admission
- **THEN** its span records validation failure without running the handler or changing admission/recursion/error semantics

### Requirement: Async execution and logging context isolation

Promise callbacks, timers, parallel work and resumed Effect fibers SHALL retain the current execution context. Logs SHALL resolve correlation when written across generated, middleware, standalone and Effect loggers. Closing one generation SHALL NOT disable another generation's context.

#### Scenario: Nested manual work runs concurrently

- **WHEN** two requests execute nested manual spans and parallel dependency operations
- **THEN** child parentage and logs identify the deepest active span without leaking identity or sinks across requests/generations

#### Scenario: Observer fails

- **WHEN** a lifecycle observer throws or rejects
- **THEN** the application callback executes once and retains its original result or error
