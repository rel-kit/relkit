## Purpose

Defines domain-first application organization and the generic, database, authentication, and route contracts that make one service the public boundary of each domain.

## ADDED Requirements

### Requirement: Every graph-visible domain has one service boundary
Each top-level application domain under `src/<domain>` SHALL contain exactly one service descriptor at `service.ts`; `routes` and `platform` SHALL remain reserved non-domain layers, and plain non-descriptor TypeScript files SHALL remain opaque.

#### Scenario: Domain descriptors are discovered
- **WHEN** functions, events, errors, jobs, tools, agents, caches, buckets, or other descriptors exist below `src/orders`
- **THEN** the compiler assigns them to the `orders` domain and rejects the project if `src/orders/service.ts` is missing, duplicated, or empty of graph-visible capability

### Requirement: Generic services expose original public members
`defineService` SHALL accept optional function and event maps and expose their original descriptor values as direct typed members without cloning, nested member maps, invocation middleware, or service context.

#### Scenario: Function is exposed
- **WHEN** `createOrder` is supplied as the `createOrder` function member
- **THEN** `orders.createOrder` is referentially equal to `createOrder` and is marked public while unlisted domain functions remain internal

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

