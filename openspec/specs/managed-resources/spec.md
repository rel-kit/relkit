## Purpose

Defines global provider resolution and portable bucket/cache behavior, including safety, lifecycle, capability reporting, and reusable conformance expectations.

## Requirements

### Requirement: Environment-scoped global providers

Each runtime generation SHALL resolve one provider set from the active application environment, use the `default` logical profile unless a descriptor names another profile, and construct each required provider once within generation scope.

#### Scenario: Active environment starts

- **WHEN** the application selects development, test, or production
- **THEN** only that environment's globally configured capability providers and referenced logical profiles are constructed

#### Scenario: Profile is missing

- **WHEN** the graph references a logical profile absent from the selected provider set
- **THEN** readiness fails with a structured profile diagnostic before traffic activation

### Requirement: Provider metadata is safe and portable

The graph SHALL record logical capability/profile names, supported features, non-secret configuration names, and selection source location, while executable factories remain in the runtime manifest and credentials/live clients remain outside both graph and browser APIs.

#### Scenario: Provider graph projection is inspected

- **WHEN** global provider configuration includes credentials and endpoints
- **THEN** graph JSON contains only permitted non-secret metadata and never resolved credential values or clients

#### Scenario: Provider declaration uses an environment token

- **WHEN** a provider option references a field from the environment descriptor
- **THEN** application evaluation remains value-free, the graph records only the required variable name and sensitivity metadata, and the manifest factory receives its resolved value only inside generation startup

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
