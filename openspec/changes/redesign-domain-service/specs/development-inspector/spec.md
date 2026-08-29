## ADDED Requirements

### Requirement: Inspector presents the domain model
The Inspector SHALL provide domain list and detail views backed by service graph nodes and SHALL group all domain-owned public and internal functions, events, errors, jobs, tools, agents, caches, buckets, generated artifacts, dependencies, and routes.

#### Scenario: Developer inspects a domain
- **WHEN** the developer opens the orders domain
- **THEN** the Inspector distinguishes public and internal artifacts and links its routes and service dependencies

### Requirement: Specialized services expose safe details
Database and authentication domains SHALL display only serializable schema/model, dialect, base-path, protected-route, and dependency metadata and SHALL not expose clients, credentials, handlers, callbacks, or secrets.

#### Scenario: Database service is inspected
- **WHEN** the database domain detail is loaded
- **THEN** tables, safe column metadata, selectors, and custom method names are visible without a live database object

