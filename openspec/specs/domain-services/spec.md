# domain-services Specification

## Purpose
Defines domain-first application organization and the generic, database, authentication, and route contracts that make one service the public boundary of each domain.
## Requirements
### Requirement: Every graph-visible domain has one service boundary
Each top-level application domain under `src/<domain>` SHALL contain exactly one service descriptor at `service.ts`; `routes` and `platform` SHALL remain reserved non-domain layers, and plain non-descriptor TypeScript files SHALL remain opaque.

#### Scenario: Domain descriptors are discovered
- **WHEN** functions, events, errors, jobs, tools, agents, caches, buckets, or other descriptors exist below `src/orders`
- **THEN** the compiler assigns them to the `orders` domain and rejects the project if `src/orders/service.ts` is missing, duplicated, or empty of graph-visible capability

### Requirement: Generic services expose original public members
`defineService` SHALL accept optional function, event, task and job maps and expose their original descriptor values as direct typed members without cloning, nested member maps, invocation middleware, or service context.

#### Scenario: Function is exposed
- **WHEN** `createOrder` is supplied as the `createOrder` function member
- **THEN** `orders.createOrder` is referentially equal to `createOrder` and is marked public while unlisted domain functions remain internal

### Requirement: Task domain membership does not expose browser endpoints
Task/job membership SHALL preserve explicit durable identity and its selected/default binding, require the existing domain service boundary and cross-domain import rules, and SHALL not itself grant client access.

#### Scenario: Private job exposed as domain member
- **WHEN** a service exposes a private job descriptor
- **THEN** server callers retain its typed trigger but no browser procedure is generated

### Requirement: Cross-domain imports use service boundaries
Application imports crossing domain roots SHALL resolve through the target domain's `service.ts`; routes SHALL import domain services rather than internals, and platform modules SHALL not import domains or routes.

#### Scenario: Internal module is imported across domains
- **WHEN** an orders module imports a payments function file instead of `payments/service.ts`
- **THEN** compilation fails with both the importing source and the permitted service boundary

### Requirement: Service route maps are typed and explicit
`defineServiceRoutes` SHALL map each configured function-route HTTP method to a public function of one service using shorthand or full route options, while `ALL` remains exclusive to raw handlers.

#### Scenario: Several methods share a route file
- **WHEN** a route exports a destructured `GET` and `POST` from one service route map
- **THEN** both compile to the same route contracts as individual `defineRoute` declarations and retain their selected public member types

### Requirement: Drizzle service owns lazy persistence
`defineDrizzleService` SHALL own one lazy sync-or-async client factory, one non-empty single-dialect schema, optional base-operation overrides and custom models, and optional idempotent runtime disposal without opening a connection during compilation.

#### Scenario: Custom model executes in a transaction
- **WHEN** a `defineModel` extension is called inside the portable database transaction API
- **THEN** its injected dialect-typed database is the transaction-bound client and the caller supplies only the extension's public arguments

### Requirement: Better Auth service uses the application database and route mount
`defineBetterAuthService` SHALL accept native Better Auth options except framework-owned database and base-path settings, resolve the sole Drizzle service, and derive its base path from exactly one raw auth route mount.

#### Scenario: Auth is mounted once
- **WHEN** one `ALL` route targets the auth service handler and declares protected application paths
- **THEN** runtime construction supplies the active Drizzle client, inferred provider and schema, and route-derived base path without serializing options or callbacks

### Requirement: Generated domain artifacts preserve ownership and exposure

Scaffolding SHALL place every domain artifact beneath one selected or newly created generic service domain. Generated functions and events SHALL be public by default, while errors, jobs, caches, buckets, tools, prompts, agents, and constants remain internal descriptors unless a declared relationship exposes their behavior. Generic service selection SHALL exclude singleton database and auth services.

#### Scenario: Public function is added

- **WHEN** a function is added to an existing generic service
- **THEN** its original descriptor is exposed directly by that service and no wrapper implementation is generated

#### Scenario: New service is selected from another add command

- **WHEN** an add command resolves `--create-service`
- **THEN** it creates the service and its requested artifact as one transaction without an unrelated sample function

### Requirement: Generated callable relationships are graph-visible

Full and custom bundles SHALL use existing public authoring APIs so declared errors, published events, event-only consumers, jobs, derived tools, agents, prompts, and service routes normalize into the graph with stable domain-qualified identities.

#### Scenario: Full bundle is compiled

- **WHEN** the generated full service bundle passes `relkit check`
- **THEN** the normalized graph contains the public function and event, the function's error and publication, the event consumer, job target, derived tool, agent tool and prompt, and GET service-route target
