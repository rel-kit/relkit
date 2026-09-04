## Purpose

Defines global provider resolution and portable bucket/cache behavior, including safety, lifecycle, capability reporting, and reusable conformance expectations.

## Requirements

### Requirement: Provider readiness and release

Every required provider SHALL validate configuration, construct resources, perform safe health/connectivity and capability checks where applicable, register shutdown, and release in reverse dependency order; any failure SHALL keep the generation non-ready.

#### Scenario: Cache provider health check fails

- **WHEN** a required cache provider cannot pass readiness
- **THEN** candidate activation is rejected and previously acquired providers are released without replacing an active development generation

### Requirement: Typed bucket contract

A declared bucket SHALL expose Promise-based `put`, `get`, `head`, `delete`, `exists`, `list`, and capability-gated signed read/write URL operations only to functions that declared that bucket dependency.

#### Scenario: Object lifecycle succeeds

- **WHEN** a declared function puts a valid object and later heads, gets, lists, and deletes its key
- **THEN** content and metadata round-trip according to the logical bucket contract and observed edges are recorded

#### Scenario: Unsupported signed URL is requested

- **WHEN** the active provider reports no signed URL capability
- **THEN** the client returns an explicit unsupported-capability failure rather than silently simulating support

### Requirement: Bucket key and object safety

Bucket providers SHALL reject traversal, absolute paths, null bytes, reserved internal prefixes, and platform separator escapes; SHALL enforce object-size and content-type policy; and SHALL prevent partial writes from becoming visible as complete objects.

#### Scenario: Unsafe key is supplied

- **WHEN** a local bucket operation uses `../`, an absolute path, a null byte, or an internal reserved prefix
- **THEN** the operation is rejected before any file outside the bucket root is read or written

#### Scenario: Write fails before commit

- **WHEN** a bucket write is interrupted before atomic completion
- **THEN** readers see either the previous complete object or no object, never partial content

### Requirement: Typed cache contract

A declared cache SHALL expose validated Promise-based `get`, `set`, `delete`, `has`, `getOrSet`, and numeric `increment` only when the value contract supports it, with descriptor default/max TTL enforcement.

#### Scenario: Typed value expires

- **WHEN** a cache entry reaches its TTL under the active clock
- **THEN** subsequent reads treat it as missing without relying on arbitrary real-time sleeps in tests

#### Scenario: Invalid value is written

- **WHEN** a value does not satisfy the cache schema or a TTL exceeds policy
- **THEN** the cache rejects the write and preserves the prior entry

### Requirement: Canonical cache keys and single-flight

Cache keys SHALL derive from cache ID, schema version, and canonical JSON so object property order is irrelevant; `getOrSet` SHALL provide per-key single-flight within one generation and SHALL accurately report any cross-process limitation.

#### Scenario: Equivalent object keys are used

- **WHEN** two key objects differ only in property insertion order
- **THEN** they address the same cache entry

#### Scenario: Concurrent misses occur

- **WHEN** multiple callers invoke `getOrSet` for the same key in one generation
- **THEN** only one producer runs and all successful callers receive the same validated value

### Requirement: Opaque bounded local state

Local providers SHALL keep implementation state beneath `.relkit/state` and observability state beneath `.relkit/observability`, SHALL bound cache retention/eviction as configured, and SHALL treat these files as opaque to application code.

#### Scenario: Runtime restarts

- **WHEN** local persistent behavior is promised and a generation restarts against the same state root
- **THEN** complete committed state is recovered and malformed records are quarantined rather than exposed to application code

### Requirement: Reusable provider conformance

Bucket and cache implementations SHALL run shared provider contract suites, with unsupported behavior represented by declared capability metadata and asserted as unsupported instead of silently skipped.

#### Scenario: Provider lacks a capability

- **WHEN** a provider contract suite encounters an unsupported signed URL or distributed single-flight feature
- **THEN** the suite verifies the provider's explicit capability report and does not mark the behavior as passing

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

### Requirement: Bucket profiles have unique physical ownership

Each bucket logical profile SHALL belong to exactly one bucket descriptor.

#### Scenario: Two buckets reuse a profile

- **WHEN** two bucket descriptors reference the same profile
- **THEN** compilation fails with a diagnostic naming both descriptors and the duplicate profile

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

### Requirement: Logical managed operation spans

Cache, bucket and database logical operations SHALL emit one operation span at call time. Transactions SHALL parent their contained operations and end after commit or rollback. Overrides, recovery reads and internal transaction mechanics SHALL remain inside the logical operation.

#### Scenario: Database activation is reused

- **WHEN** a cached activation is reused by another request or generation
- **THEN** its operations use that caller's current context and sink without retaining earlier request identity

#### Scenario: MySQL mutation performs recovery

- **WHEN** an overridden mutation uses an internal transaction and recovery read
- **THEN** the logical mutation is represented once and failure/rollback is correctly recorded
