## Purpose

Defines provider-neutral deployment planning and Pulumi Automation API delivery to the first AWS target with stable identities, safe previews, and verified cleanup.

## Requirements

### Requirement: Provider-neutral deployment plan

Deployment SHALL consume the canonical graph and produce a versioned deterministic plan containing graph hash, application image/environment names, HTTP, jobs, schedules, events/triggers, buckets, cache, logical model profiles, and observability without Pulumi inputs/outputs, executable callbacks, resolved secrets, or live cloud objects.

#### Scenario: Full graph is planned

- **WHEN** a production-capable fixture graph is converted to a deployment plan
- **THEN** every declared deployable capability has a stable logical entry, required non-secret configuration names, health/image settings, and the matching graph hash

### Requirement: Pulumi is the only POC deployment engine

Deployment init, preview, up, refresh, outputs, and destroy SHALL be driven through Pulumi Automation API and the Pulumi CLI/backend; ZSys SHALL NOT introduce another infrastructure engine or state system.

#### Scenario: Deployment stack is initialized

- **WHEN** `zsys deploy init --stack development` succeeds
- **THEN** it creates/selects a Pulumi project and explicit stack using the configured Pulumi backend without creating ZSys-owned infrastructure state

### Requirement: Stable resource identity

Pulumi project, stack, logical resource names, parent relationships, and tags SHALL derive from normalized application/stable descriptor IDs and explicit stack, not source paths, with tags including app, stack, graph hash, and `managed-by=zsys`.

#### Scenario: Source file moves

- **WHEN** a descriptor moves but its stable ID and contract remain unchanged
- **THEN** preview reports no resource replacement caused by the file move

#### Scenario: No graph change occurs

- **WHEN** deployment is run twice with identical plan/configuration
- **THEN** the second preview/update is a true no-op

### Requirement: Complete initial AWS mapping

The AWS target SHALL map the Bun/Hono service to ECR plus ECS/Fargate and ALB, jobs to SQS/DLQ, schedules to EventBridge Scheduler, events to an EventBridge bus/rules, durable listeners to SQS-backed consumers, buckets to S3, cache to ElastiCache Serverless for Valkey, logs to CloudWatch/optional OTLP, the v3 OpenAI model profile to a secret-safe production runtime adapter, and environment/secrets to configured deployment injection.

#### Scenario: Capability lacks AWS support

- **WHEN** a production graph requests a capability/profile without an AWS implementation
- **THEN** deployment planning fails before preview with a structured capability diagnostic

#### Scenario: Selected cache or model configuration is unavailable

- **WHEN** the target region lacks the selected Valkey serverless topology or an agent graph lacks complete OpenAI profile configuration
- **THEN** planning fails before preview and reports only safe missing capability/configuration metadata

### Requirement: Production build artifact safety

`zsys build` SHALL create deterministic server, manifest, graph, OpenAPI, and container files; the image SHALL pin Bun, run non-root, contain only production files, expose health endpoints, handle SIGTERM, drain traffic, flush bounded telemetry, and exclude `.env` and local `.zsys/state` data.

#### Scenario: Container receives SIGTERM

- **WHEN** the production process is ready and receives SIGTERM during an in-flight request
- **THEN** it stops accepting new traffic, drains or cancels by deadline, flushes bounded telemetry, and exits within the configured limit

### Requirement: Preview makes no cloud changes

`zsys deploy preview` SHALL run application checks, build or use a deterministic plan-test image placeholder, generate the plan/program, configure/select the stack, stream redacted Pulumi events through framework logging, summarize the resource diff, write a machine-readable report, and make no cloud mutation.

#### Scenario: Preview includes destructive change

- **WHEN** Pulumi reports a deletion or replacement
- **THEN** the summary and report classify the risk with stable resource identities while leaving cloud state unchanged

### Requirement: Controlled deployment changes

`zsys deploy up` SHALL require successful compilation and SHALL require explicit interactive confirmation for destructive or security-sensitive changes unless a documented non-interactive CI flag grants that action.

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
