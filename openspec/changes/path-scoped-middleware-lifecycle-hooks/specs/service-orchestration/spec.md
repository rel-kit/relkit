## MODIFIED Requirements

### Requirement: Service policy applies to every invocation source

Ordered service middleware SHALL run through the common invocation engine for each service-member invocation from HTTP, direct calls, jobs, events, tools, and agents, after initial input validation and around the member's lifecycle hooks and handler.

#### Scenario: Member is reached from different sources

- **WHEN** the same service member is invoked over HTTP and through another function
- **THEN** the same ordered request-free service middleware runs once for each invocation

#### Scenario: Service middleware rejects an invocation

- **WHEN** service middleware throws a declared rejection before calling `next`
- **THEN** later middleware, function hooks, and the member handler do not run, and the common engine records the normalized outcome

#### Scenario: Service middleware controls continuation

- **WHEN** service middleware returns without calling `next` or calls `next` more than once
- **THEN** the engine records a safe policy defect and does not admit an extra member lifecycle execution

### Requirement: Service context is scoped and immutable

Service middleware SHALL receive only function input and context and SHALL be able to enrich a per-invocation service context without receiving or mutating a raw transport request, the base public context, another concurrent invocation, or process-global state.

#### Scenario: Middleware enriches context

- **WHEN** middleware adds authenticated principal or tenant data
- **THEN** downstream service middleware, function hooks, and the member handler observe an immutable merged service context for that invocation only

#### Scenario: Concurrent members execute

- **WHEN** two invocations of the same service run concurrently with different context values
- **THEN** neither invocation can observe or mutate the other's service context
