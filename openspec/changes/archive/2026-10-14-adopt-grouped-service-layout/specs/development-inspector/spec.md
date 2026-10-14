## MODIFIED Requirements

### Requirement: Inspector presents the domain model

The Inspector SHALL provide domain list and detail views backed by service graph nodes and SHALL group all domain-owned public and internal functions, events, errors, jobs, tools, agents, caches, buckets, generated artifacts, dependencies, and routes. Flat and grouped applications SHALL use the same logical domain identities and exposure; `services` SHALL NOT appear as an extra domain or identity prefix. Source navigation SHALL use actual project-relative paths for the matching generation, without independent filesystem layout discovery.

#### Scenario: Developer inspects a domain

- **WHEN** the developer opens the orders domain
- **THEN** the Inspector distinguishes public and internal artifacts and links its routes and service dependencies

#### Scenario: Grouped generation replaces flat source

- **WHEN** a validated grouped generation becomes active after a service move
- **THEN** domain navigation retains orders as its logical identity and current source links target `src/services/orders/`, while historical records use matching generation data or explicitly show source unavailable

## ADDED Requirements

### Requirement: Layout rebuilds preserve active behavior and persistent state

Development SHALL detect moves and service-boundary additions/deletions and SHALL retain the last-known-good application when an intermediate or final layout is invalid. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Successful regeneration SHALL replace only owned generated/build artifacts and SHALL NOT delete persistent job state, agent journals, runtime state, or observability records. Changed executable fingerprints SHALL still obey existing cohort and accepted-work version routing; source movement SHALL NOT authorize activation of an incompatible old build.

#### Scenario: Watch observes an incomplete manual move

- **WHEN** a move temporarily leaves missing or mixed boundaries
- **THEN** diagnostics show the invalid candidate while the previous generation and Inspector graph continue serving until a valid complete candidate passes activation checks

#### Scenario: Compatible move is restarted

- **WHEN** a complete grouped application is prepared and restarted against its existing compatible state
- **THEN** durable and historical records remain accessible under their original logical identities and only a verified current executable cohort activates
