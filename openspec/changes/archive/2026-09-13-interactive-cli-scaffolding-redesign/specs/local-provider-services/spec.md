## ADDED Requirements

### Requirement: Local event and job providers are public integrations

`@relkit/local` SHALL expose side-effect-free `localEvent()` and `localJob()` authoring adapters and SHALL register matching runtimes backed by the existing durable filesystem event and job provider implementations.

#### Scenario: Local event profile is compiled and run

- **WHEN** an application binds an event profile with `localEvent()`
- **THEN** compilation resolves the integration metadata and runtime activation uses the durable local event provider for the profile's stable scope

#### Scenario: Local unscheduled job profile is compiled and run

- **WHEN** an application binds an unscheduled job with `localJob()`
- **THEN** runtime activation registers the existing local job queue implementation without claiming scheduler support

### Requirement: Scaffolded local runtime state is explicit

Generated local event and job profiles SHALL use named, project-scoped filesystem state and SHALL not start processes, invoke jobs, or erase state during scaffolding.

#### Scenario: Full service creates local profiles

- **WHEN** a full service bundle needs fallback event and job providers
- **THEN** source configuration declares deterministic local profiles and next steps explain their state requirements without performing runtime work
