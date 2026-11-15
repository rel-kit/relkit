## ADDED Requirements

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
