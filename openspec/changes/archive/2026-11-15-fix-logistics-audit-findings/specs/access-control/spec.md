## ADDED Requirements

### Requirement: Authentication is decided before input is reported

For a function with an access rule, the runtime SHALL reject a caller without a session, and a caller who fails a rule that does not depend on input, before it reports input validation errors.

#### Scenario: Anonymous caller with an invalid body

- **WHEN** a caller without a session sends an invalid body to a protected route
- **THEN** the response is 401 and names no input field

#### Scenario: Caller without the permission

- **WHEN** a signed-in caller lacking the required permission sends an invalid body
- **THEN** the response is 403 and names no input field
