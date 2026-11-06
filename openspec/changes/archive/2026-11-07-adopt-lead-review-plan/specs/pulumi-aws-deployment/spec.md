# Spec Delta

## ADDED Requirements

### Requirement: Pulumi drives targets with maintained providers

For targets that use Pulumi, deploy init, preview, up, refresh, outputs and destroy SHALL run through
the Pulumi Automation API and the configured Pulumi backend without RelKit-owned infrastructure state,
and applications that select no Pulumi target SHALL NOT load Pulumi.

#### Scenario: Deployment stack is initialized

- **WHEN** `relkit deploy init aws --stack development` succeeds
- **THEN** it creates or selects a Pulumi project and an explicit stack using the configured Pulumi
  backend, without creating RelKit-owned infrastructure state

#### Scenario: Ordinary CLI help or backend starts

- **WHEN** no Pulumi target is selected
- **THEN** help, configuration metadata and backend startup require no Pulumi implementation or
  deployment-only AWS SDK

### Requirement: AWS hosting is Labs until proven

AWS hosting SHALL be labelled Labs until it builds and pushes its own image, serves HTTPS, runs more
than one task and passes a real deploy test in CI.

#### Scenario: Docs before the criteria pass

- **WHEN** the AWS deployment docs are viewed before those criteria pass
- **THEN** the page carries the Labs badge and lists the missing criteria

## REMOVED Requirements

### Requirement: Pulumi is the only POC deployment engine

**Reason**: Deployment now targets Railway, Vercel and Cloudflare, using platform-native
configuration where no maintained Pulumi provider exists (`deployment-targets`).

**Migration**: Existing AWS and Pulumi projects keep working; Pulumi remains the engine for targets
with maintained providers.
