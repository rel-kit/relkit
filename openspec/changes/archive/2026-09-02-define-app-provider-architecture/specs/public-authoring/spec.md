## ADDED Requirements

### Requirement: defineApp is the canonical application contract

`defineApp` SHALL be the sole application configuration constructor and SHALL accept application identity, handler-visible environment, singular provider capability inputs, profile defaults, telemetry, server, Inspector, and deployment descriptors as one immutable plain-TypeScript topology.

#### Scenario: Direct cache binding is authored

- **WHEN** an application passes `docker(redis())` to singular key `cache`
- **THEN** type inference retains the Redis adapter contract and normalization creates profile `default`

#### Scenario: Multiple cache bindings are authored

- **WHEN** `cache` is a map containing `requests` and `timeline`
- **THEN** logical cache descriptors can select either profile and no environment-specific provider branch is needed

### Requirement: Complete application descriptor surface

The public authoring API SHALL support the existing application concepts plus provider bindings, local sources, infrastructure sources, static integration descriptors, telemetry exporters, deployment engine/host descriptors, and explicit test replacements without exposing runtime clients or implementation import paths.

#### Scenario: Full canonical fixture is authored

- **WHEN** the commerce fixture declares application, domain, HTTP, async, resource, model, telemetry, local, and deployment concepts
- **THEN** every declaration is a branded value-free descriptor and application code performs no runtime registration

## REMOVED Requirements

### Requirement: Complete v3 descriptor surface

**Reason**: The application surface now includes the provider-binding, integration, local-service, telemetry, and deployment contracts introduced by public contract version 5.

**Migration**: Repository-owned applications SHALL adopt `defineApp` and the complete current descriptor surface; no v3 compatibility contract is retained.

#### Scenario: Legacy descriptor baseline is assumed

- **WHEN** source or generated output depends on the old v3-only application surface
- **THEN** type checking or contract-version validation rejects it and requires regeneration

### Requirement: Global logical provider configuration

**Reason**: Capability adapters no longer use `external` or `managed` ownership wrappers and are normalized by the provider-binding protocol.

**Migration**: Replace external bindings with configured adapters, local bindings with `docker(adapter)`, and managed bindings with an infrastructure wrapper such as `aws(adapter, options)`.

#### Scenario: Legacy ownership wrapper is imported

- **WHEN** source imports `external` or `managed`
- **THEN** the public package provides no such export

### Requirement: Convention-based typed configuration

**Reason**: `defineConfig` and its legacy topology are replaced by the `defineApp` application contract.

**Migration**: Rewrite `relkit.config.ts` to export `defineApp`; no alias or automated migration command is provided.

#### Scenario: defineConfig is imported

- **WHEN** source imports or calls `defineConfig`
- **THEN** type checking fails with the removed API absent

