# Spec Delta

## Purpose

Defines how RelKit authenticates requests and authorizes function calls, so protection is declared
next to the code it protects and enforced for every caller.

## ADDED Requirements

### Requirement: Route-level authentication

A function route SHALL accept `auth: "required"`, which rejects a request without a valid session
with HTTP 401 before the target function runs. A route without it SHALL NOT require a session.

#### Scenario: Signed-out request

- **WHEN** a request without a session reaches a route with `auth: "required"`
- **THEN** the response is 401 in the standard error format and the function does not run

### Requirement: Function access rules

A function SHALL accept an `access` rule — required roles, required permissions, or a predicate over
the session and input — that the engine checks before the handler runs.

#### Scenario: Missing role

- **WHEN** a signed-in user without the `admin` role calls a function that requires it
- **THEN** the call fails with 403 over HTTP and with a coded access-denied error for other callers

### Requirement: Enforcement for every caller

Access rules SHALL be enforced for HTTP routes, jobs, tasks, event consumers, tools, agents, MCP and
runtime-handle calls.

#### Scenario: Tool call on behalf of a user

- **WHEN** an agent calls a protected function through a tool for a user without permission
- **THEN** the call is denied as it would be over HTTP

### Requirement: Roles from Better Auth organizations

Roles and permissions SHALL come from the Better Auth organization plugin when it is configured.

#### Scenario: Organization role

- **WHEN** a user is an `admin` member of the active organization
- **THEN** `access: { roles: ["admin"] }` allows the call

### Requirement: Visible protection

Route authentication and function access rules SHALL appear in the graph, in OpenAPI security
metadata and in the Inspector.

#### Scenario: OpenAPI security

- **WHEN** OpenAPI is generated for a route with `auth: "required"`
- **THEN** the operation declares the session security requirement

### Requirement: System and delegated calls

Calls through the runtime handle SHALL run as a `system` caller that satisfies access rules, and
`relkit.as(session)` SHALL apply the given user's rules instead.

#### Scenario: Script acts as a user

- **WHEN** a script calls a protected function through `relkit.as(session)`
- **THEN** the user's roles and permissions decide the outcome
