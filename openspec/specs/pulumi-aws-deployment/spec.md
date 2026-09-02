## Purpose

Defines provider-neutral deployment planning and Pulumi Automation API delivery to the first AWS target with stable identities, safe previews, and verified cleanup.

## Requirements

### Requirement: Pulumi is the only POC deployment engine

Deployment init, preview, up, refresh, outputs, and destroy SHALL be driven through Pulumi Automation API and the Pulumi CLI/backend; RelKit SHALL NOT introduce another infrastructure engine or state system.

#### Scenario: Deployment stack is initialized

- **WHEN** `relkit deploy init --stack development` succeeds
- **THEN** it creates/selects a Pulumi project and explicit stack using the configured Pulumi backend without creating RelKit-owned infrastructure state

### Requirement: Stable resource identity

Pulumi project, stack, logical resource names, parent relationships, and tags SHALL derive from normalized application/stable descriptor IDs and explicit stack, not source paths, with tags including app, stack, graph hash, and `managed-by=relkit`.

#### Scenario: Source file moves

- **WHEN** a descriptor moves but its stable ID and contract remain unchanged
- **THEN** preview reports no resource replacement caused by the file move

#### Scenario: No graph change occurs

- **WHEN** deployment is run twice with identical plan/configuration
- **THEN** the second preview/update is a true no-op

### Requirement: Production build artifact safety

`relkit build` SHALL create deterministic server, manifest, graph, OpenAPI, and container files; the image SHALL pin Bun, run non-root, contain only production files, expose health endpoints, handle SIGTERM, drain traffic, flush bounded telemetry, and exclude `.env` and local `.relkit/state` data.

#### Scenario: Container receives SIGTERM

- **WHEN** the production process is ready and receives SIGTERM during an in-flight request
- **THEN** it stops accepting new traffic, drains or cancels by deadline, flushes bounded telemetry, and exits within the configured limit

### Requirement: Preview makes no cloud changes

`relkit deploy preview` SHALL run application checks, build or use a deterministic plan-test image placeholder, generate the plan/program, configure/select the stack, stream redacted Pulumi events through framework logging, summarize the resource diff, write a machine-readable report, and make no cloud mutation.

#### Scenario: Preview includes destructive change

- **WHEN** Pulumi reports a deletion or replacement
- **THEN** the summary and report classify the risk with stable resource identities while leaving cloud state unchanged

### Requirement: Controlled deployment changes

`relkit deploy up` SHALL require successful compilation and SHALL require explicit interactive confirmation for destructive or security-sensitive changes unless a documented non-interactive CI flag grants that action.

#### Scenario: Destructive update lacks confirmation

- **WHEN** an interactive deployment contains a destructive change and confirmation is declined
- **THEN** no update is applied and the command exits with a documented result

### Requirement: Least-privilege service permissions

AWS service-role permissions SHALL be derived from declared graph capability edges where practical and SHALL be service-level for the shared POC runtime while retaining per-function desired capability metadata for future isolation.

#### Scenario: Service uses one bucket and event publication

- **WHEN** the graph declares those edges and no job consumption
- **THEN** the generated policy includes required S3/EventBridge actions and omits unrelated queue-consumer permissions

### Requirement: Secret-safe Pulumi integration

Pulumi secrets and deployment environment credentials SHALL remain in supported backend/configuration mechanisms and SHALL NOT enter graph JSON, deployment plan snapshots, logs, preview reports, generated source, or application-facing types.

#### Scenario: Pulumi emits a secret-marked value

- **WHEN** deployment events or outputs contain secret values
- **THEN** logs and reports preserve secret marking/redaction and never serialize plaintext

### Requirement: Layered deployment verification and cleanup

Deployment SHALL have pure plan goldens, Pulumi mock tests, stable naming/tag/IAM snapshots, preview tests, container lifecycle tests, and isolated AWS acceptance that exercises HTTP/jobs/events/bucket/cache, verifies a no-op update, destroys the stack, and confirms cleanup.

#### Scenario: AWS acceptance completes

- **WHEN** a release-gated ephemeral stack passes all capability smoke checks
- **THEN** the workflow destroys it and records both successful behavior and verified resource cleanup

### Requirement: Hosting selection is project configuration

Deployment target and infrastructure adapter SHALL be selected under project configuration and SHALL not be inferred from application provider adapters.

#### Scenario: AWS hosts protocol resources from other vendors

- **WHEN** `relkit.config.ts` selects AWS/Pulumi and the application selects external R2 and Upstash bindings
- **THEN** deployment hosts the service on AWS without treating either external binding as an AWS-managed resource

### Requirement: Event-function deployment remains least privilege

AWS deployment SHALL create durable EventBridge/SQS trigger resources from generated exact-event triggers and SHALL derive publisher IAM permissions only from function `publishes-event` edges.

#### Scenario: Function publishes one event

- **WHEN** a function declares one event in `publishes`
- **THEN** its service policy permits that event publication and does not grant unrelated event permissions

#### Scenario: Durable event function is deployed

- **WHEN** an event function uses durable delivery
- **THEN** deployment creates the existing independently retryable consumer resources using its deterministic generated trigger ID

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
