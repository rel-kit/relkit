## MODIFIED Requirements

### Requirement: Integration resolution is static and verifiable

A branded constructor SHALL supply an integration ID owned by its installed package; generated runtime references SHALL resolve through that package's exports map, remain inside its package root, report matching capability/adapter/protocol identities, reject duplicates, record package version and export provenance, and be ordered deterministically.

#### Scenario: Runtime export reports another identity

- **WHEN** a selected runtime module reports an integration, capability, adapter, or protocol version different from its plan entry
- **THEN** build or activation fails before application traffic

#### Scenario: Integration package is installed

- **WHEN** an application installs and selects an integration package
- **THEN** that package is treated as trusted executable code while RelKit validates identity and compatibility without claiming to sandbox it

#### Scenario: Adapter runs outside the workspace
- **WHEN** a selected integration runs in a workspace, isolated installation or package-runner invocation
- **THEN** resolution starts at the consuming application for the adapter and at the correct selected-adapter context for its peers, respects exports including hidden package.json, and never substitutes CLI-cache or workspace-hoisted packages

## ADDED Requirements

### Requirement: Dependency requirements are capability and phase specific
Integration declarations SHALL expose serializable package, supportedRange, installSection, capabilities and phases requirements through the existing integration mechanism. Validation SHALL include only selected capabilities in check, build, runtime or deploy phases and SHALL NOT scan every installed package or activate unused registrations.

#### Scenario: Redis package advertises an unused capability
- **WHEN** only Redis cache is selected and its agent-state peer is absent
- **THEN** cache validates and runs without loading or requiring agent-state execution

#### Scenario: Deployment SDK is absent during runtime startup
- **WHEN** only deployment requires that SDK
- **THEN** runtime startup does not require it while selected deployment validation does

### Requirement: Selected requirements fail accurately before readiness
Check, build and startup SHALL validate selected requirements before promising readiness. Diagnostics SHALL distinguish missing package, unsupported version, unsupported protocol and installed-module initialization failure, preserve original causes, and identify capability, source when known, package, required range, installed version and package-manager-specific install action.

#### Scenario: Several selected requirements are missing
- **WHEN** static discovery safely identifies multiple absent peers
- **THEN** one report aggregates those requirements without network access or manifest/lockfile mutation

#### Scenario: Installed SDK fails initialization
- **WHEN** a compatible selected SDK fails due to credentials, configuration or an absent nested dependency
- **THEN** its original initialization cause is retained instead of incorrectly reporting the selected SDK as uninstalled

#### Scenario: Selected package changes after preparation
- **WHEN** a selected peer is removed or upgraded after a successful preparation
- **THEN** startup rejects stale dependency validation before readiness

### Requirement: Requirement diagnostics never implicitly install
Imports, requests, check, dev, build and startup SHALL NOT download or install dependencies. Interactive scaffold/add SHALL preview explicit installation changes using the project's package manager and preserve lockfiles and noninteractive behavior.

#### Scenario: Creator runs through npx in a Bun project
- **WHEN** missing requirements need an installation command
- **THEN** guidance uses the project's detected package manager and npx invocation alone does not select npm
