## MODIFIED Requirements

### Requirement: Every graph-visible domain has one service boundary

Each graph-visible application service domain SHALL contain exactly one service descriptor at `src/services/<domain>/service.ts` in grouped applications or `src/<domain>/service.ts` in previously valid flat applications. `routes` and `platform` SHALL remain reserved non-domain layers. `services` SHALL be an identity-neutral grouping container, not a domain. Plain non-descriptor TypeScript files SHALL remain opaque to independent descriptor evaluation; helper-only folders SHALL NOT require a service boundary merely because they exist. Generic services SHALL retain their graph-visible capability requirement, and specialized database/auth services SHALL retain their existing authoring and lifecycle contracts.

#### Scenario: Domain descriptors are discovered

- **WHEN** functions, events, errors, tasks, jobs, channels, tools, agents, caches, buckets, or other descriptors exist below the selected `orders` service root
- **THEN** the compiler assigns them to `orders` and rejects the project if its boundary is missing, duplicated, or empty of graph-visible capability

#### Scenario: Helpers and specialized services are discovered

- **WHEN** a grouped application contains ordinary helper folders and valid Drizzle and Better Auth service boundaries
- **THEN** helper folders do not become independent domains and the specialized services remain database/auth services without generic wrappers or new dependency fields

#### Scenario: Grouping or nested boundary is authored

- **WHEN** a service descriptor is declared at `src/services/service.ts` or as a nested independent service beneath an owning service
- **THEN** compilation rejects the unsupported boundary with its source and the permitted service-root shape while ordinary internal subfolders remain valid

### Requirement: Cross-domain imports use service boundaries

Application imports crossing domain roots SHALL resolve through the target domain's `service.ts` in the selected layout. Services SHALL depend only on their own internals, other public service boundaries, and Platform application modules. Routes and HTTP middleware SHALL depend only on route helpers, public service boundaries, and Platform application modules. Platform SHALL depend only on Platform application modules; `relkit.config.ts` SHALL use Platform for application configuration support. External package dependencies SHALL remain subject to existing package rules. Ordinary helpers, re-exports, and type-only imports SHALL obey the same boundaries as descriptor files. Application code SHALL NOT use test or operational tooling as an intermediate path to forbidden application dependencies.

#### Scenario: Internal module is imported across domains

- **WHEN** an orders module imports a payments function file instead of the payments `service.ts`, through a relative path, project alias, type-only import, or re-export chain
- **THEN** compilation fails with the importing source, the forbidden target, and the permitted service boundary in the selected layout

#### Scenario: Allowed service dependency is used

- **WHEN** a route or another service imports `orders/service.ts` in a valid flat or grouped application
- **THEN** the import remains valid and service-to-service dependencies retain their logical domain identities

#### Scenario: Helper attempts a layer escape

- **WHEN** a Platform helper imports a route or service, a service imports Routes, or application code reaches service internals through test tooling
- **THEN** compilation rejects the forbidden dependency even if the intermediary contains no descriptor

## ADDED Requirements

### Requirement: Applications select one service layout from authored evidence

The compiler and tooling SHALL select grouped or flat layout from relevant authored service boundaries and descriptor ownership evidence, not empty directories. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Previously valid flat applications SHALL remain supported without automatic moves, and applications with no service evidence SHALL default to grouped scaffolding. Authored service evidence in both roots SHALL fail as a mixed layout, including different service names. A duplicate logical service in both roots SHALL identify both conflicting paths without merging or choosing one. Previously forbidden layer-first roots SHALL remain invalid.

#### Scenario: Flat application contains an empty grouping directory

- **WHEN** a valid flat application has an empty `src/services/` directory
- **THEN** compilation and additions keep the flat layout

#### Scenario: Mixed layout contains different names

- **WHEN** `src/orders/service.ts` and `src/services/payments/service.ts` both declare services
- **THEN** compilation fails with actionable mixed-layout diagnostics naming both roots

#### Scenario: Same domain exists twice

- **WHEN** both `src/orders/service.ts` and `src/services/orders/service.ts` declare orders
- **THEN** compilation identifies both conflicting locations and emits no new activatable output

#### Scenario: Empty application or removed layer-first form is supplied

- **WHEN** tooling examines an application with no service evidence or an application containing descriptors in a previously forbidden layer-first root
- **THEN** the empty application selects grouped scaffolding and the forbidden form receives its structural error rather than being treated as supported flat layout
