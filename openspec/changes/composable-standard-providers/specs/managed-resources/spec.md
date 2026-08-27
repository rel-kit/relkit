## MODIFIED Requirements

### Requirement: Environment-scoped global providers

Each runtime generation SHALL resolve graph-required capability/profile bindings from one application topology, use the `default` logical profile unless a descriptor names another profile, construct each required binding once, and avoid constructing unreferenced bindings. Capability credentials, construction, health, and failure SHALL remain isolated from unrelated capabilities.

#### Scenario: Generation starts

- **WHEN** the graph requires one bucket and no cache
- **THEN** only the selected bucket binding is constructed and cache credentials or connectivity cannot affect readiness

#### Scenario: Profile is missing

- **WHEN** the graph references a logical profile absent from the capability topology
- **THEN** readiness fails with a structured profile diagnostic before traffic activation

#### Scenario: Test generation starts

- **WHEN** `@relkit/testing` creates a runtime without an explicit integration-adapter opt-in
- **THEN** every required binding uses deterministic in-memory fakes without external credentials or services

### Requirement: Provider metadata is safe and portable

The graph SHALL record capability, logical profile, adapter, ownership, supported features, and value-free environment references, while executable factories remain in the runtime manifest and resolved values, credentials, and live clients remain outside graph, manifest source, deployment plans, logs, diagnostics, and browser APIs.

#### Scenario: Provider graph projection is inspected

- **WHEN** a binding includes endpoint and credential environment references
- **THEN** graph JSON contains the reference names and sensitivity metadata but no resolved value or live client

#### Scenario: Independent capability credentials resolve

- **WHEN** R2 credentials configure a bucket and AWS workload identity configures jobs
- **THEN** R2 credentials are supplied only to the bucket adapter and never reach jobs, events, hosting, observability, or deployment credentials

## ADDED Requirements

### Requirement: Standard S3-compatible bucket adapter

The standard S3 adapter SHALL accept endpoint, bucket name, region, optional secret credential references, path-style selection, cancellation, metadata, listing, and signed URL operations compatible with AWS S3, R2, MinIO, and conforming S3 endpoints.

#### Scenario: S3-compatible endpoint is configured

- **WHEN** endpoint, region, bucket name, credentials, and path-style values describe an R2 or MinIO bucket
- **THEN** the normal bucket client contract operates against that endpoint without selecting an AWS provider recipe

### Requirement: Standard Redis-compatible cache adapter

The standard Redis adapter SHALL accept a secret environment reference containing a `redis://` or `rediss://` URL and provide the cache contract against Redis, Valkey, ElastiCache, and Upstash Redis protocol endpoints.

#### Scenario: Redis-compatible endpoint is configured

- **WHEN** a TLS/authenticated Upstash URL or local Redis URL is supplied by the pipeline
- **THEN** cache JSON values, TTL, deletion, existence, and numeric increment use the same application cache client contract

### Requirement: Provider ownership is explicit

Every binding SHALL be `external` or `managed`; external bindings SHALL never be provisioned, while managed bindings MAY be provisioned and rebound by the selected deployment target.

#### Scenario: External bucket is deployed

- **WHEN** an application binds a bucket through `external(s3(...))`
- **THEN** deployment creates no bucket resource or bucket IAM statement and runtime uses pipeline values unchanged

#### Scenario: Managed cache is deployed

- **WHEN** an application binds cache through a supported `managed(...)` adapter
- **THEN** deployment provisions it and generated connection values override conflicting pipeline connection values

### Requirement: Bucket profiles have unique physical ownership

Each bucket logical profile SHALL belong to exactly one bucket descriptor.

#### Scenario: Two buckets reuse a profile

- **WHEN** two bucket descriptors reference the same profile
- **THEN** compilation fails with a diagnostic naming both descriptors and the duplicate profile
