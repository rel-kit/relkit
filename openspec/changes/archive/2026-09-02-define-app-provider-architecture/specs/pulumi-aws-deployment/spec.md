## ADDED Requirements

### Requirement: Deployment roles are explicit integration references

Deployment plan v3 SHALL identify one deployment engine, one application host, infrastructure operations for provisioned bindings, access operations, and connected-binding runtime wiring as separate stable integration references with versioned JSON-safe configuration.

#### Scenario: Mixed provider plan is generated

- **WHEN** Pulumi and AWS ECS host an application using connected Cloudflare KV and infrastructure-owned AWS S3
- **THEN** the plan wires Cloudflare values without lifecycle operations and delegates only the S3 resource and access operations to AWS

### Requirement: Infrastructure wrappers own release resources

An infrastructure integration SHALL accept only compatible deferred or partially configured adapters, SHALL produce declared connection outputs and access operations, and SHALL reject authored connection values that conflict with authoritative outputs unless explicitly marked as fallbacks.

#### Scenario: AWS S3 binding is deployed

- **WHEN** deployment materializes `aws(s3(), { versioning: true })`
- **THEN** it provisions the bucket, grants only declared workload access, and supplies connection outputs without changing S3 behavior fields

### Requirement: Connected bindings never own lifecycle

Connected bindings SHALL remain in the deployment plan for required-value validation, runtime wiring, and declared external identity, but SHALL produce no create, update, replace, delete, or implicit access-grant operation.

#### Scenario: Connected R2 binding is removed from the app

- **WHEN** a new deployment plan no longer references it
- **THEN** the diff removes only runtime wiring and never proposes deletion of the external bucket

### Requirement: AWS host routes production logs

The AWS host integration SHALL configure the redacted structured stdout sink for CloudWatch Logs and SHALL NOT materialize a CloudWatch application exporter.

#### Scenario: AWS deployment is previewed

- **WHEN** host logging is included
- **THEN** the preview contains host log routing and no in-process CloudWatch credentials or exporter resource

## REMOVED Requirements

### Requirement: Provider-neutral deployment plan

**Reason**: The previous plan omitted connected bindings and represented only managed ownership rather than explicit engine, host, infrastructure, access, and wiring roles.

**Migration**: Regenerate deployment plan v3 from the new provider-binding and integration plans.

#### Scenario: Deployment plan v2 is consumed

- **WHEN** preview or deployment receives the previous plan version
- **THEN** it fails with a regeneration diagnostic before cloud interaction

### Requirement: Complete initial AWS mapping

**Reason**: AWS hosting no longer implicitly owns every capability selected by the application.

**Migration**: Wrap only AWS-provisioned adapters with `aws(...)`; configure connected vendors directly and choose AWS ECS separately as host.

#### Scenario: Host is assumed to own a connected resource

- **WHEN** an AWS host plan attempts lifecycle or IAM operations for a connected binding
- **THEN** plan validation fails before preview

