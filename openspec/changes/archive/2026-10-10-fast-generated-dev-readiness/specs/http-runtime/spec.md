## ADDED Requirements

### Requirement: Lazy routes retain fully validated HTTP semantics

Development SHALL permit on-demand loading of route executable implementations from an already fully validated generation. Complete route contracts, collisions, precedence, middleware relationships, and required application registrations SHALL be validated before activation. The readiness route's execution dependencies SHALL be ready before probing. Deferred implementation loading SHALL preserve common-engine execution, auth, rate limits, request/response validation, middleware order, tracing, and complete provider readiness.

#### Scenario: An unrelated route has not been materialized

- **WHEN** the prepared backend serves its readiness route before another route implementation is loaded
- **THEN** the first response executes its real validated target and the unrelated route loads on its first request using the same validated generation

#### Scenario: Static and dynamic routes load at different times

- **WHEN** matching routes have different executable loading states
- **THEN** selection still follows canonical precedence rather than whichever implementation has loaded first

#### Scenario: Protected route is requested for the first time

- **WHEN** a caller without a valid session requests a deferred protected route
- **THEN** existing auth protection prevents authored middleware and target invocation without bypassing protection during loading

#### Scenario: A route is invalid before preparation

- **WHEN** any route has a collision, invalid mapping, missing target, or semantic/type error
- **THEN** preparation cannot certify the generation even when the invalid route is not the first readiness route

### Requirement: Deferred loading has generation-specific ownership

Concurrent first requests for a deferred implementation SHALL share one per-generation initialization. Shared executable modules SHALL retain one identity. Loading SHALL use verified immutable generation inputs and SHALL remain cancellable within generation shutdown. Failed loading SHALL produce the existing safe failure response and correlated diagnostic without a fabricated successful route response or duplicate side effects.

#### Scenario: Concurrent requests first reach one route

- **WHEN** multiple requests need the same unmaterialized implementation
- **THEN** it initializes once for that generation and each request preserves its own execution context and cancellation

#### Scenario: Deferred implementation fails

- **WHEN** import, integrity verification, or initialization fails
- **THEN** requests receive a safe error, the failure is correlated, and other loaded routes remain available

#### Scenario: Generation retires during loading

- **WHEN** a generation is replaced or shut down while an implementation load is pending
- **THEN** the load remains owned by that generation, pending work is finalized within the drain bound, and its result cannot enter the replacement generation

### Requirement: Development serving proof identifies the active graph

Backend readiness SHALL establish that current environment, required providers, registrations, graph/cohort, and HTTP dispatch are active. Generated example projects SHALL prove readiness through a safe real generated application route and its expected status/body. Fullstack SHALL use API `/hello`. Without examples, a protected development endpoint SHALL return live generation, graph, activation, and route-table identity only after the active engine and HTTP registrations are ready. Liveness, static artifact responses, or a readiness banner SHALL not constitute serving proof.

#### Scenario: No-examples project becomes ready

- **WHEN** a generated project without example routes is probed through its public development address
- **THEN** successful graph-serving readiness identifies the actual active generation and its verified graph/dispatch cohort

#### Scenario: Endpoint is queried too early

- **WHEN** required application initialization or registration is incomplete
- **THEN** graph-serving readiness stays non-ready rather than returning a successful static snapshot response

#### Scenario: Old child still answers

- **WHEN** a response identifies a previous generation or an unexpected graph/cohort
- **THEN** that response cannot qualify as readiness of the launched command
