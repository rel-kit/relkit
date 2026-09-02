## Purpose

Defines the portable provider protocol that selects, configures, materializes, validates, and tests capability bindings independently from application hosting and handler-visible environment values.

## ADDED Requirements

### Requirement: Provider authoring is pure and serializable

Adapter, source, profile, deployment, and local-overlay constructors SHALL synchronously return immutable branded descriptors without reading environment values, loading runtime implementations, opening sockets, starting containers, constructing SDK clients, or performing other I/O.

#### Scenario: Application configuration is evaluated

- **WHEN** a configuration declares `docker(redis())`, a connected Redis adapter, and an AWS-backed S3 adapter
- **THEN** evaluation produces only frozen value-free descriptors and no integration runtime or local service is started

### Requirement: Direct bindings and profile maps normalize deterministically

Each singular capability input SHALL accept either one binding or a named profile map; a direct binding SHALL normalize to profile `default`, descriptor selection SHALL outrank `defaults.<capability>`, a sole profile SHALL be selected automatically, and an unresolved choice among multiple profiles SHALL fail compilation.

#### Scenario: Two cache servers are declared

- **WHEN** `cache` contains `requests` and `timeline` profiles and a logical cache selects `timeline`
- **THEN** compilation links that logical cache only to the `timeline` physical binding

#### Scenario: Multiple profiles lack a selection

- **WHEN** a capability has multiple profiles and neither its logical descriptor nor application defaults select one
- **THEN** compilation fails with a diagnostic naming the capability, logical descriptor, and available profiles

### Requirement: Application environment and binding values remain distinct

Handler-visible application environment contracts SHALL resolve globally and populate `ctx.env`; named values authored directly inside integration options SHALL resolve only for their binding and SHALL NOT satisfy, weaken, or fabricate application environment fields with the same name.

#### Scenario: Docker satisfies a required binding value

- **WHEN** Redis names `CACHE_URL`, no pipeline value exists, and its healthy local recipe produces a URL
- **THEN** Redis receives the binding-local URL while a separately declared missing application environment field still prevents readiness

#### Scenario: Two profiles reuse a value name

- **WHEN** two Docker-backed profiles both name `CACHE_URL`
- **THEN** their generated URLs remain isolated by binding identity and neither value enters `ctx.env`

### Requirement: Binding source forms are concise and exclusive

A configured plain adapter SHALL represent a connected service, `docker(adapter)` SHALL add or solely provide a local source, and an infrastructure wrapper SHALL provide the release source plus a compatible default local recipe. A binding SHALL have at most one release source and one local source; public `connect`, `connection`, and `provision` wrappers SHALL NOT exist.

#### Scenario: Local-only adapter is deployed

- **WHEN** deployment encounters `docker(redis())`
- **THEN** planning fails with a diagnostic identifying the binding and explaining that a connected or infrastructure release source is required

#### Scenario: Infrastructure binding receives Docker again

- **WHEN** application code composes `docker(aws(s3()))`
- **THEN** the public type contract or compilation rejects the duplicate local/source composition

### Requirement: Connection fields and behavior fields are independent

Each adapter SHALL declare its connection contract separately from behavior configuration; infrastructure and local outputs SHALL satisfy only declared connection fields, and authored values that conflict with authoritative outputs SHALL be rejected unless the contract marks them as fallbacks.

#### Scenario: S3 behavior survives materialization

- **WHEN** `aws(s3({ signedUrlTtlSeconds: 900 }), { versioning: true })` is materialized
- **THEN** AWS outputs supply endpoint, bucket, region, and access while the adapter retains the authored signed-URL behavior

### Requirement: Binding configuration has one precedence order

Binding resolution SHALL use local override, infrastructure output, named runtime value, adapter fallback, then adapter default, and diagnostics SHALL identify the binding and missing field without exposing resolved secret values.

#### Scenario: Local services are disabled

- **WHEN** local execution is disabled, an infrastructure output is unavailable, and a required named runtime value is absent
- **THEN** startup fails with the binding ID and value name rather than silently starting Docker or choosing another profile

### Requirement: Features and access are binding metadata

Adapters SHALL declare supported features; logical resources SHALL declare required features; compilation SHALL reject incompatible selections. Access policy SHALL belong to the binding or infrastructure operation rather than adapter behavior options.

#### Scenario: Logical cache requires atomic increment

- **WHEN** a selected cache adapter lacks `atomicIncrement`
- **THEN** compilation fails before runtime construction with the logical resource, profile, and missing feature

#### Scenario: Connected service uses external identity

- **WHEN** a connected binding relies on credentials or workload identity supplied outside RelKit
- **THEN** deployment wires its declared runtime values but creates no resource or implicit access grant

### Requirement: Integration resolution is static and verifiable

A branded constructor SHALL supply an integration ID owned by its installed package; generated runtime references SHALL resolve through that package's exports map, remain inside its package root, report matching capability/adapter/protocol identities, reject duplicates, record package version and export provenance, and be ordered deterministically.

#### Scenario: Runtime export reports another identity

- **WHEN** a selected runtime module reports an integration, capability, adapter, or protocol version different from its plan entry
- **THEN** build or activation fails before application traffic

#### Scenario: Integration package is installed

- **WHEN** an application installs and selects an integration package
- **THEN** that package is treated as trusted executable code while RelKit validates identity and compatibility without claiming to sandbox it

### Requirement: Provider replacement is explicit in tests

The test harness SHALL accept binding replacements by capability and profile, and the production registry SHALL never replace a configured adapter because an environment is named `test`, `development`, or `production`.

#### Scenario: Test replaces one cache profile

- **WHEN** a test supplies a fake for `cache.requests`
- **THEN** only that binding is replaced and every other required real binding must be explicitly configured or replaced

