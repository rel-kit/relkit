## ADDED Requirements

### Requirement: Jobs packages preserve optional integrations and safe dependency direction

Core authoring/runtime contracts SHALL remain separate from optional Inngest/Trigger/effect-mq implementations. Browser contracts SHALL import no server handlers, secrets, Effect or deployment SDKs. Task/job schema inference and legacy type exports SHALL resolve without cyclic jobs/functions implementation dependencies. All new exports/integrations SHALL participate in package metadata, declaration, packing and fixed release-cohort checks; no workflow/task-store package SHALL be introduced.

#### Scenario: Browser bundle is built

- **WHEN** a consumer imports generated jobs and client helpers
- **THEN** the bundle includes only safe contracts/helpers and no server/provider implementation

#### Scenario: App installs one provider

- **WHEN** an application uses only Inngest
- **THEN** core packages do not install Trigger or effect-mq SDKs
