## MODIFIED Requirements

### Requirement: Pulumi is the only POC deployment engine

Explicitly selected deployment init, preview, up, refresh, outputs, and destroy SHALL be driven through Pulumi Automation API and the Pulumi CLI/backend; RelKit SHALL NOT introduce another infrastructure engine or state system.

#### Scenario: Deployment stack is initialized

- **WHEN** `relkit deploy init --stack development` succeeds
- **THEN** it creates/selects a Pulumi project and explicit stack using the configured Pulumi backend without creating RelKit-owned infrastructure state

#### Scenario: Ordinary CLI help or backend starts
- **WHEN** deployment is not selected
- **THEN** help/configuration metadata and backend startup require no Pulumi implementation or deployment-only AWS SDK

### Requirement: Production build artifact safety

`relkit build` SHALL create deterministic server, manifest, graph, OpenAPI, and container files; the image SHALL pin Bun, run non-root, contain only production files, expose health endpoints, handle SIGTERM, drain traffic, flush bounded telemetry, and exclude `.env` and local `.relkit/state` data.

#### Scenario: Container receives SIGTERM

- **WHEN** the production process is ready and receives SIGTERM during an in-flight request
- **THEN** it stops accepting new traffic, drains or cancels by deadline, flushes bounded telemetry, and exits within the configured limit

#### Scenario: Selected runtime has external native requirements
- **WHEN** a supported runtime driver or worker is external to the JavaScript bundle
- **THEN** generated production dependency metadata and container copy allowlists include every required external module, native binary, worker and asset without development-tooling fallback

#### Scenario: Artifact is moved and installed production-only
- **WHEN** emitted JavaScript and its complete runtime closure are relocated outside the checkout with development dependencies omitted
- **THEN** documented startup, readiness, native functionality and shutdown pass without CLI/compiler/inspector/Pulumi and no rich inspection endpoint is registered

## ADDED Requirements

### Requirement: Deployment implementation resolves from its selected integration
CLI parsing/help and authoring metadata SHALL remain independent of deployment execution SDKs. A selected integration SHALL own and resolve its implementation from the consumer's installation, with deployment-only requirements excluded from runtime startup and production output.

#### Scenario: Packed consumer prepares deployment offline
- **WHEN** an external packed consumer selects AWS/Pulumi and executes supported plan/mock verification
- **THEN** selected implementation resolution succeeds without workspace hoisting or cloud mutation, while an unselected backend does not install those SDKs
