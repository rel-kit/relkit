## ADDED Requirements

### Requirement: Model integrations use provider profiles

The singular model capability SHALL accept a direct binding or named profile map using statically resolved AI SDK integrations; agent model selectors SHALL choose a profile and optional model ID, while credentials, runtime implementations, and live model objects remain outside descriptors and browser artifacts.

#### Scenario: Agent omits a model profile

- **WHEN** exactly one model profile exists or `defaults.model` names one
- **THEN** runtime uses that profile and its declared default model

#### Scenario: Multiple model profiles are ambiguous

- **WHEN** an agent omits selection and no default resolves among multiple profiles
- **THEN** compilation fails before any model integration is loaded

### Requirement: Model fakes are explicit

Deterministic scripted model providers SHALL be supplied as named test replacements and SHALL NOT be selected because runtime is in a test environment.

#### Scenario: Agent test supplies a scripted profile

- **WHEN** `createTestApplication` replaces the selected model profile
- **THEN** the agent runs deterministically without network or real credentials

## REMOVED Requirements

### Requirement: Agents use configured AI SDK models

**Reason**: Model selection no longer resolves through an active-environment registry.

**Migration**: Move AI SDK adapters to model bindings and select them by profile or application default.

#### Scenario: Active environment model registry is expected

- **WHEN** source relies on an environment-specific AI SDK registry
- **THEN** compilation rejects the legacy topology

### Requirement: Model provider defaults are explicit

**Reason**: `defaultProvider`, `defaultModel`, and `modelProviders` are replaced by direct/profile bindings and `defaults.model`.

**Migration**: Configure one or more model bindings and place adapter defaults inside the selected integration descriptor.

#### Scenario: Legacy model defaults are declared

- **WHEN** application configuration contains the removed model registry fields
- **THEN** type checking or configuration validation fails

