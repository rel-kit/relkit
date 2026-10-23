## MODIFIED Requirements

### Requirement: defineApp is the canonical application contract

`defineApp` SHALL remain the sole immutable application configuration constructor. It SHALL accept plural `jobs` and `defaults.jobs` over the existing internal `job` capability, existing singular other capabilities, environment, telemetry, server, Inspector and deployment. One-release `job`/`defaults.job` aliases SHALL issue migration diagnostics and conflict with their new spellings. Explicit `compatibility: { legacyJobs: true }` SHALL enable the deprecated legacy descriptor runtime only.

#### Scenario: Direct cache binding is authored

- **WHEN** an application passes `docker(redis())` to singular key `cache`
- **THEN** type inference retains the Redis adapter contract and normalization creates profile `default`

#### Scenario: Multiple cache bindings are authored

- **WHEN** `cache` is a map containing `requests` and `timeline`
- **THEN** logical cache descriptors can select either profile and no environment-specific provider branch is needed

#### Scenario: Inspection is explicitly enabled
- **WHEN** defineApp includes inspector with enabled true and omits connection
- **THEN** it selects only a development bridge on 127.0.0.1 with OS-selected port 0, without starting or requiring the UI/store

#### Scenario: Legacy UI port is supplied
- **WHEN** configuration supplies inspector.port
- **THEN** validation rejects it with guidance to use connection.host/connection.port for the bridge and standalone command settings for UI port 3210

## ADDED Requirements

### Requirement: Ordinary authoring has no optional execution dependency
Generic application, function, route, service and agent declarations SHALL remain usable without unselected execution SDKs or user-written Effect. SDK-native helpers and public types SHALL be imported through their explicit integration rather than disguised as vendor-neutral contracts.

#### Scenario: Backend authoring is typechecked
- **WHEN** a minimal REST/RPC application consumes packed public declarations
- **THEN** it needs no LangChain, LangGraph, LangSmith, DeepAgents, frontend, inspector storage or deployment SDK unless explicitly selected

### Requirement: Inspection selection is independent of installation
Omitted or false inspection SHALL create no listener, worker, database, process or discovery file. Installing the tool SHALL NOT enable inspection. Production builds SHALL exclude rich inspection registration even if configuration or legacy environment overrides attempt to enable it.

#### Scenario: Installed tool remains disabled
- **WHEN** the application has the tool installed but no enabled inspector configuration
- **THEN** ordinary backend behavior works with none of the inspection resources acquired

#### Scenario: Production attempts to enable inspection
- **WHEN** production starts with inspector enabled or RELKIT_INTERNAL_ENDPOINTS set
- **THEN** the bridge and rich inspector APIs remain absent while independently owned core endpoints retain their required behavior
