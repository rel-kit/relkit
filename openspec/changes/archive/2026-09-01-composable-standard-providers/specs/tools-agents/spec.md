## MODIFIED Requirements

### Requirement: Model provider defaults are explicit

The application topology SHALL contain an independent models binding with `defaultProvider`, `defaultModel`, and one or more named model providers; the default provider SHALL exist, credentials SHALL use secret environment references, and unknown or incomplete providers SHALL fail before readiness. Model configuration SHALL not be selected by application environment branches.

#### Scenario: Defaults resolve

- **WHEN** the models binding selects OpenAI and supplies its API key by secret environment reference
- **THEN** runtime creates the official model adapter without exposing the resolved key in graph, manifest, plan, diagnostics, or logs

#### Scenario: Default provider is absent

- **WHEN** `defaultProvider` does not name an entry in the models binding
- **THEN** compilation or readiness fails with a safe configuration diagnostic before any model request

#### Scenario: Multiple providers are configured

- **WHEN** OpenAI and Anthropic entries are configured in the same models binding
- **THEN** agents can select either while agents without a selector use the stable defaults in every pipeline environment
