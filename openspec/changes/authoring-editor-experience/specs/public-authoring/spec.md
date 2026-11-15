## ADDED Requirements

### Requirement: Default profiles are typed by the application's own providers

`defineApp` SHALL type every entry of `defaults` by the provider binding of the same capability in the same call: the keys of a map of named profiles, or `default` for a single adapter. A default that is not one of those names, or that belongs to a capability without a provider, SHALL be exactly one type error on that property.

#### Scenario: Profile names are suggested

- **WHEN** a developer asks for suggestions at the value of `defaults.bucket`, empty or inside quotes, in an application whose `bucket` is a map of two profiles
- **THEN** the editor offers both profile names

#### Scenario: A single adapter is the profile `default`

- **WHEN** the capability is bound to one adapter and the developer asks for suggestions inside the quotes of its default
- **THEN** the editor offers `default`

#### Scenario: A wrong profile name

- **WHEN** `defaults.bucket` names a profile the application does not configure
- **THEN** type-checking reports one error, on `bucket`, that lists the configured profile names

#### Scenario: A capability without a provider

- **WHEN** `defaults` has an entry for a capability the application binds no provider to
- **THEN** type-checking reports one error, on that entry, that names the capability

### Requirement: Unknown application options are type errors

An option that `defineApp` does not accept SHALL be a type error, whether or not the call configures providers.

#### Scenario: An unknown option beside providers

- **WHEN** a `defineApp` call that configures providers also has an option `defineApp` does not accept
- **THEN** type-checking reports the unknown option
