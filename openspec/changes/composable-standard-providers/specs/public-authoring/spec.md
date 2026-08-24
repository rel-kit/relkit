## MODIFIED Requirements

### Requirement: Value-free environment contracts

Environment declarations SHALL produce static resolved types, runtime parsing rules, defaults, optional environment-specific requirements, descriptions, examples, sensitivity metadata, and JSON-safe graph projections without resolving process or file values during descriptor evaluation. Applications SHALL declare one schema whose keys receive pipeline-specific values, and SHALL NOT declare the framework-reserved `ZSYS_ENV` key.

#### Scenario: Secret environment variable is compiled

- **WHEN** an environment descriptor includes a secret variable
- **THEN** graph metadata records its name, type, requirement/default presence, and sensitivity but never its value

#### Scenario: Runtime environment is invalid

- **WHEN** a runtime generation resolves a missing or malformed required value
- **THEN** readiness fails before provider construction or traffic activation and identifies the variable without revealing secret content

#### Scenario: Identical keys receive pipeline-specific values

- **WHEN** local and production pipelines launch the same application topology with different endpoint and credential values
- **THEN** both value sets are validated against the same environment schema without provider branches

#### Scenario: Application declares the reserved runtime key

- **WHEN** an application environment schema declares `ZSYS_ENV`
- **THEN** authoring or compilation rejects it as framework-reserved

### Requirement: Global logical provider configuration

Applications SHALL define one provider topology composed from capability adapters and explicit `external` or `managed` ownership, while resource and trigger descriptors reference only logical profiles and never contain vendor credentials, SDK clients, implementation paths, hosting selection, or environment branches.

#### Scenario: Logical profile is selected

- **WHEN** a resource declares profile `archive`
- **THEN** compilation links it to the topology's `archive` binding for that capability or emits `ZSYS_PROVIDER_PROFILE_UNKNOWN`

#### Scenario: Provider option references environment

- **WHEN** provider metadata uses environment references for endpoint, region, or credentials
- **THEN** descriptor evaluation records typed variable references without reading values and generation resolves them only after environment validation

#### Scenario: Secret adapter field is literal

- **WHEN** an adapter credential or secret URL is provided as a literal
- **THEN** authoring or compilation rejects it and no literal enters graph, manifest, plan, diagnostics, or logs

#### Scenario: Hosting is configured

- **WHEN** a project deploys to AWS with Pulumi
- **THEN** hosting target and adapter are selected in project configuration independently of application providers

## REMOVED Requirements

### Requirement: Environment-specific provider recipes

**Reason**: Provider recipes coupled runtime capabilities and cloud hosting to named application environments.

**Migration**: Define one provider topology with protocol adapters wrapped in `external(...)` or `managed(...)`, and supply values in each pipeline.
