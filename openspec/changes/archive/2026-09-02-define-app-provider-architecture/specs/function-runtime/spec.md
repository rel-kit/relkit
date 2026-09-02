## ADDED Requirements

### Requirement: Runtime resolves only required static integrations

Generation startup SHALL validate the complete activation fingerprint, resolve binding-local configuration by the provider precedence contract, load only graph-required statically planned integrations, construct each selected binding once, and preserve readiness, cancellation, draining, and reverse-order release.

#### Scenario: Unused binding is misconfigured

- **WHEN** the graph does not require that binding
- **THEN** its integration is not imported or constructed and its missing values do not affect readiness

#### Scenario: Integration identity differs at runtime

- **WHEN** a loaded module reports metadata inconsistent with its plan entry
- **THEN** the generation never becomes ready and already acquired bindings are released

### Requirement: Test provider behavior is explicit

`@relkit/testing` SHALL apply only provider replacements named by capability and profile, and ordinary production registry behavior SHALL be identical regardless of environment-name strings.

#### Scenario: Required real binding lacks a replacement

- **WHEN** a test application requires a configured binding that cannot start and no fake is supplied
- **THEN** test startup fails with the binding identity instead of silently substituting an in-memory provider

## REMOVED Requirements

### Requirement: Deterministic application test harness

**Reason**: The previous contract implicitly replaced configured external or managed adapters in normal tests.

**Migration**: Supply deterministic fake providers explicitly through `createTestApplication` by capability and profile.

#### Scenario: Test relies on implicit fakes

- **WHEN** a test omits required provider replacements and values
- **THEN** the harness reports the unresolved binding rather than changing the application topology

