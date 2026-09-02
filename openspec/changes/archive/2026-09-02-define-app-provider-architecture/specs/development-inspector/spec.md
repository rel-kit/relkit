## ADDED Requirements

### Requirement: Inspector presents integration topology safely

Inspector SHALL show each logical resource, capability, physical profile, adapter, connected/local/infrastructure source, declared features, required binding value names, selected integration package/version, and deployment role without displaying resolved values, credentials, implementation objects, or arbitrary module paths.

#### Scenario: Mixed cache topology is inspected

- **WHEN** an application has local/connected Redis and connected Cloudflare profiles
- **THEN** their logical relationships and source behavior are distinct and no view implies that the host owns connected services

### Requirement: Inspector presents local service lifecycle

Local Inspector APIs and views SHALL show planned, starting, healthy, unhealthy, stopped, detached, and blocked lease states plus binding, recipe, plan-hash, and safe health metadata; non-local Inspector access SHALL expose no local control operations.

#### Scenario: Local service health fails

- **WHEN** a required Redis recipe does not become healthy
- **THEN** Inspector shows the binding-scoped diagnostic while the last-known-good application generation remains active

### Requirement: Inspector presents complete telemetry before export sampling

Request, log, trace, diagnostic, and generation views SHALL use the complete redacted local store and SHALL separately display exporter selection, health, dropped-export counters, and sampling decisions.

#### Scenario: Trace is not exported

- **WHEN** external sampling excludes a trace
- **THEN** its complete local timeline remains navigable and the view indicates only that external export was skipped

### Requirement: Inspector verifies activation cohorts

Generation state and readiness APIs SHALL report the composite activation fingerprint, and the supervisor SHALL refuse a candidate whose graph, manifest, runtime-integration, local-service, or override identity differs from the expected cohort.

#### Scenario: Candidate has stale local overrides

- **WHEN** readiness reports an override generation from another local plan
- **THEN** activation fails safely and Inspector identifies the mismatched cohort member

## REMOVED Requirements

### Requirement: Managed capability and agent workflows

**Reason**: Inspector no longer models external/managed ownership or one observability binding.

**Migration**: Present provider sources, static integrations, local services, and telemetry exporters through the new topology views.

#### Scenario: Legacy ownership metadata is received

- **WHEN** Inspector receives a pre-v8 graph
- **THEN** it reports that the project must be rebuilt rather than interpreting the old fields

