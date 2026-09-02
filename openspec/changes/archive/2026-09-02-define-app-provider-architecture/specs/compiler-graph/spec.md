## ADDED Requirements

### Requirement: Generated activation cohort is complete and deterministic

Compilation SHALL emit graph v8, manifest v8, runtime-integration plan v1, local-service plan v1 when declared, deployment plan v3 when requested, and non-secret activation metadata whose individual hashes form one composite activation fingerprint.

#### Scenario: Equivalent projects compile in different roots

- **WHEN** input order, absolute root, process identity, and time differ while authored topology is equivalent
- **THEN** graph, manifest, plan bytes, static import order, individual hashes, and activation fingerprint remain identical

#### Scenario: Previous artifact is activated

- **WHEN** runtime receives graph v7, manifest v7, deployment plan v2, or a missing required v1 plan
- **THEN** activation fails with a precise rebuild or regeneration diagnostic

### Requirement: Runtime integrations are statically planned

The compiler SHALL derive selected integration IDs and package exports from branded descriptors, emit deterministic static runtime references only for graph-required integrations, and reject application-authored import paths, duplicate registrations, package-root escapes, and protocol mismatches.

#### Scenario: Application contains a runtime import path

- **WHEN** an authored descriptor attempts to select an implementation by arbitrary module path
- **THEN** compilation fails before generating executable output

## REMOVED Requirements

### Requirement: Hash-matched runtime manifest

**Reason**: The manifest no longer embeds provider factories and graph-hash equality alone is insufficient to verify the generated cohort.

**Migration**: Rebuild to manifest v8 and use the composite activation fingerprint with the runtime-integration and optional local-service plans.

#### Scenario: Manifest-only activation is attempted

- **WHEN** runtime receives a graph and manifest without their required integration-plan identity
- **THEN** activation is rejected before registration

### Requirement: Provider contracts are versioned as a cohort

**Reason**: The contract cohort now includes public contract, generator, graph, manifest, deployment, provider protocol, runtime-integration, local-service, and override formats.

**Migration**: Regenerate every artifact with the new cohort; no old provider artifact reader is retained.

#### Scenario: Partial cohort is regenerated

- **WHEN** one artifact has a current version but another required cohort member is stale
- **THEN** build or activation rejects the mismatched cohort

