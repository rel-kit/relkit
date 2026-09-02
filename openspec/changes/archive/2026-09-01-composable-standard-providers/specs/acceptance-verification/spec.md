## MODIFIED Requirements

### Requirement: Honest reusable provider contracts

Every standard bucket/cache implementation SHALL run shared logical contracts against supported protocol variants, and unsupported behavior SHALL be explicitly represented. S3 contracts SHALL cover AWS-style, R2-style, and MinIO-style endpoints; Redis contracts SHALL cover Redis/Valkey-compatible endpoints with TLS/authentication where applicable.

#### Scenario: Provider capability differs

- **WHEN** two providers differ on signed URLs, ordering, durability, or distributed coordination
- **THEN** each suite asserts the declared capability and common behavior while explicitly testing the unsupported result

#### Scenario: Bucket protocol matrix runs

- **WHEN** shared bucket tests run against AWS-style, R2-style, and MinIO-style endpoints
- **THEN** credentials, metadata, listing, cancellation, and signed URLs satisfy or explicitly reject the same declared contract

#### Scenario: Cache protocol matrix runs

- **WHEN** shared cache tests run against Redis, Valkey, and Upstash-compatible URLs
- **THEN** TLS/authentication, TTL, JSON values, deletion, and numeric increment satisfy the same declared contract

### Requirement: Generated and migrated applications prove the new workflow

Generated templates, the commerce application, canonical fixtures, and migration fixtures SHALL compile and run using one provider topology, pipeline-owned values, project-owned hosting configuration, and no compatibility shims.

#### Scenario: Templates are packed and generated

- **WHEN** packed CLI artifacts generate all templates in isolated temporary roots
- **THEN** the minimal project stays minimal, the API project proves service/event fan-out, and the agent project proves `asTool` and both model defaults using only packed public artifacts

#### Scenario: Legacy authoring is scanned

- **WHEN** migration verification scans public examples, templates, and documentation
- **THEN** no active example uses `context.functions`, required IDs on eligible source-scoped descriptors, `modelProfile`, the custom `ModelProvider`, or the handwritten OpenAI protocol adapter

#### Scenario: Existing sample is migrated

- **WHEN** `my-relkit-app-7` is checked after migration
- **THEN** it uses `external(s3(...))` and `external(redis(...))`, has no misleading AWS provider wrapper around R2, and does not declare `RELKIT_ENV`

## ADDED Requirements

### Requirement: Ownership and credential isolation are verified

Tests SHALL prove that external bindings produce no provisioned resources or IAM, managed bindings override pipeline connection values, unrelated capability credentials never cross adapter boundaries, and default testing requires no external credentials.

#### Scenario: Mixed topology is verified

- **WHEN** deployment and runtime tests use external R2/Upstash with managed AWS jobs/events/hosting
- **THEN** each binding has correct ownership, values, permissions, and isolated failures across graph, manifest, runtime, plan, and mocks
