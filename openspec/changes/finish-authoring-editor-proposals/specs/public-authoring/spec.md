## ADDED Requirements

### Requirement: Descriptor profiles are typed by the application's providers

The generated context registry SHALL carry the profile names of the application's providers per capability, and `profile` in `defineBucket`, `defineCache`, `defineEvent` and `defineChannel` SHALL accept only the names of its capability, with `default` for a capability bound to one adapter. Where the registry carries no names for the capability, `profile` SHALL accept any string.

#### Scenario: Profile names are suggested

- **WHEN** a developer asks for suggestions inside the quotes of `profile` in a bucket of an application with two bucket profiles
- **THEN** the editor offers both names

#### Scenario: A wrong profile name

- **WHEN** `profile` names a profile the application does not configure
- **THEN** type-checking reports one error on that property

#### Scenario: No registry

- **WHEN** a descriptor is defined where no generated registry declares profile names
- **THEN** any string is accepted as `profile`

### Requirement: An unknown option of a function, task or job is one error on its key

`defineFunction`, `defineEventFunction`, `defineTask` and `defineJob` SHALL report an option they do not accept as one type error on that key, whose text names the key. The removed option `publishes` SHALL be reported with a text that names `dependencies.events`, and SHALL NOT be suggested.

#### Scenario: A misspelled option

- **WHEN** a function is defined with `timeout` instead of `timeoutMs`
- **THEN** type-checking reports one error, on `timeout`, that names it

### Requirement: Task forms share one signature

`defineTask` SHALL be one call signature for its durable and retryable forms, so that an editor suggests both values of `execution` and the handler's context follows the chosen form.

#### Scenario: Execution values are suggested

- **WHEN** a developer asks for suggestions inside the quotes of `execution`
- **THEN** the editor offers `durable` and `retryable` on every supported compiler
