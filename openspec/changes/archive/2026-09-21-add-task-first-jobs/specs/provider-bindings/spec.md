## ADDED Requirements

### Requirement: TJ-003 Public jobs service configuration

Applications MUST configure jobs services through `jobs` and `defaults.jobs`, normalized into the existing provider system.

#### Scenario: Public jobs service configuration

- **WHEN** both job and jobs, defaults.job and defaults.jobs, or profile and service are supplied
- **THEN** compilation fails without choosing a value; the single new spelling normalizes to capability job

### Requirement: Job binding changes apply only to new acceptance

Service clients SHALL be isolated per application/environment/service generation. Credentials and runtime instances SHALL not share mutable global defaults. Retained runs SHALL keep the original binding and supported locator-verification keys; removal, resource shrinking or retention changes SHALL expose impact and block unsafe retirement.

#### Scenario: Same provider different credentials

- **WHEN** two configured jobs services use one provider with different credentials
- **THEN** every operation and callback remains scoped to its own service generation

#### Scenario: Retired service referenced by history

- **WHEN** a removal would make a retained run unroutable
- **THEN** retirement is blocked until an explicit drain/retention decision resolves the impact

## MODIFIED Requirements

### Requirement: Direct bindings and profile maps normalize deterministically

Existing singular capability inputs SHALL retain binding/map normalization, direct default profile, explicit-selection precedence and automatic sole-profile resolution. New public jobs SHALL normalize to internal job profiles; explicit job.service SHALL outrank defaults.jobs and an implicit/direct default profile SHALL be usable. A sole non-default named jobs profile SHALL require defaults.jobs or job.service. Old/new configuration spellings SHALL conflict rather than silently override.

#### Scenario: Two cache servers are declared

- **WHEN** `cache` contains `requests` and `timeline` profiles and a logical cache selects `timeline`
- **THEN** compilation links that logical cache only to the `timeline` physical binding

#### Scenario: Multiple profiles lack a selection

- **WHEN** a capability has multiple profiles and neither its logical descriptor nor application defaults select one
- **THEN** compilation fails with a diagnostic naming the capability, logical descriptor, and available profiles
