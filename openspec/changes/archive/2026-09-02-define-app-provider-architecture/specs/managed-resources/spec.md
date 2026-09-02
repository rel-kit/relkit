## ADDED Requirements

### Requirement: Logical resources consume provider profiles

Bucket and cache descriptors SHALL retain their portable typed contracts while selecting a physical provider profile through the common provider-binding model; direct bindings SHALL remain profile `default`, and resource requirements SHALL be validated against adapter features before runtime.

#### Scenario: Two logical caches share one server

- **WHEN** two cache descriptors select the same Redis profile
- **THEN** they retain distinct logical namespaces while using one constructed physical binding

### Requirement: Resource conformance follows declared features

Bucket and cache conformance suites SHALL exercise common behavior and each adapter's declared feature variants without silently skipping unsupported behavior.

#### Scenario: S3-compatible endpoint lacks one optional feature

- **WHEN** its conformance suite reaches that feature
- **THEN** the adapter reports an explicit unsupported result while all common object-safety behavior still runs

## REMOVED Requirements

### Requirement: Environment-scoped global providers

**Reason**: Provider construction now consumes one `defineApp` topology and profile bindings without environment selection semantics.

**Migration**: Move physical services to singular capability bindings or profile maps and supply pipeline values directly to adapter options.

#### Scenario: Runtime environment selects providers

- **WHEN** source expects development, test, or production to choose another provider set
- **THEN** compilation rejects the legacy topology instead of selecting a branch

### Requirement: Provider metadata is safe and portable

**Reason**: Safe binding metadata, integration references, and runtime implementation separation are now owned by `provider-bindings` and `compiler-graph`.

**Migration**: Consume the provider-binding graph projection and runtime-integration plan; executable factories no longer belong in the runtime manifest.

#### Scenario: Embedded provider factory is expected

- **WHEN** a previous runtime manifest contains provider factories
- **THEN** the new runtime rejects its contract version and requires rebuilding

### Requirement: Provider ownership is explicit

**Reason**: The `external` and `managed` ownership enum is replaced by connected, local-only, and infrastructure binding sources.

**Migration**: Use a configured adapter, `docker(adapter)`, or an infrastructure wrapper respectively.

#### Scenario: Legacy ownership metadata is compiled

- **WHEN** a provider descriptor contains `external` or `managed` ownership
- **THEN** compilation fails rather than inferring a new source

