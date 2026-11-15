# access-control Specification

## Purpose
Defines how RelKit authenticates requests and authorizes function calls, so protection is declared
next to the code it protects and enforced for every caller.

## Requirements

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

### Requirement: Authentication is decided before input is reported

For a function with an access rule, the runtime SHALL reject a caller without a session, and a caller who fails a rule that does not depend on input, before it reports input validation errors.

#### Scenario: Anonymous caller with an invalid body

- **WHEN** a caller without a session sends an invalid body to a protected route
- **THEN** the response is 401 and names no input field

#### Scenario: Caller without the permission

- **WHEN** a signed-in caller lacking the required permission sends an invalid body
- **THEN** the response is 403 and names no input field

### Requirement: Access rules are typed by the application's access control

When an application has a Better Auth service with the organization plugin, the generated context registry SHALL carry the role names and the `resource:action` permission names of the plugin's access control, and a function's `access.roles` and `access.permissions` SHALL accept only those names. An application without that plugin, with roles created at run time, or without a generated registry SHALL keep `string`.

#### Scenario: Names are suggested

- **WHEN** a developer asks for suggestions inside the quotes of an entry of `access.permissions`
- **THEN** the editor offers every `resource:action` pair of the application's statements

#### Scenario: A misspelled permission

- **WHEN** `access.permissions` holds a name the access control does not declare
- **THEN** type-checking reports one error on that entry

#### Scenario: Roles created at run time

- **WHEN** the organization plugin enables dynamic access control
- **THEN** `access.roles` accepts any string
