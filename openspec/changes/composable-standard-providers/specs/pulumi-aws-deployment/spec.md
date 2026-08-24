## MODIFIED Requirements

### Requirement: Provider-neutral deployment plan

Deployment SHALL consume the canonical graph and produce a bumped, deterministic plan containing graph hash, hosting, jobs, schedules, events, and only managed bucket/cache/model/observability bindings, including capability/profile/adapter/ownership and value-free environment references. External bindings, executable callbacks, resolved secrets, live clients, and external-resource IAM statements SHALL be absent.

#### Scenario: Full graph is planned

- **WHEN** a graph mixes external and managed bindings
- **THEN** every managed deployable binding has a stable plan entry while external bindings and permissions are omitted

### Requirement: Complete initial AWS mapping

The AWS target SHALL map hosting to ECR plus ECS/Fargate and ALB and provision supported managed bindings such as SQS, EventBridge, S3, Valkey, model secrets, and observability independently. External bindings SHALL use pipeline values unchanged. Managed connection outputs SHALL override conflicting pipeline connection keys and workload identity SHALL be used where supported.

#### Scenario: Capability lacks AWS support

- **WHEN** a managed binding requests an adapter unsupported by the AWS target
- **THEN** deployment planning fails before preview with a structured capability/profile/adapter diagnostic

#### Scenario: External R2 bucket is present

- **WHEN** AWS hosts an application whose bucket binding is external S3-compatible R2
- **THEN** no S3 bucket or S3 IAM statement is created and the workload receives the pipeline's R2 values

#### Scenario: Managed S3 bucket is present

- **WHEN** AWS hosts an application whose bucket binding is managed S3
- **THEN** deployment provisions the bucket, binds it through workload identity, and its generated endpoint/name/region values override conflicting pipeline values

## ADDED Requirements

### Requirement: Hosting selection is project configuration

Deployment target and infrastructure adapter SHALL be selected under project configuration and SHALL not be inferred from application provider adapters.

#### Scenario: AWS hosts protocol resources from other vendors

- **WHEN** `zsys.config.ts` selects AWS/Pulumi and the application selects external R2 and Upstash bindings
- **THEN** deployment hosts the service on AWS without treating either external binding as an AWS-managed resource
