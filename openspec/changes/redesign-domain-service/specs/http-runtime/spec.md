## ADDED Requirements

### Requirement: Better Auth protection precedes authored route middleware
The HTTP runtime SHALL register declarative Better Auth session protection before authored route middleware, exclude auth endpoint paths, and reuse one memoized session lookup through route middleware and function invocation context.

#### Scenario: Protected request has no session
- **WHEN** a protected application path is requested without a session
- **THEN** the standard unauthorized response is returned and authored route middleware and the target function do not run

### Requirement: Application traffic follows complete readiness
Liveness SHALL remain available during startup, while readiness and non-internal application traffic SHALL remain unavailable until environment, providers, Drizzle, and Better Auth have completed activation.

#### Scenario: Request arrives during auth startup
- **WHEN** an application request arrives before Better Auth activation completes
- **THEN** the runtime returns a not-ready response rather than invoking a raw or function route

