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

### Requirement: Specialized runtime dependencies are substitutable

Database and authentication runtime operations SHALL support deterministic dependency substitution within the owning application lifetime. Existing synchronous authoring, Promise compatibility APIs, schema inference, model overrides, transaction-bound models, native auth session types, and route contracts SHALL remain compatible. Compilation SHALL NOT acquire database clients or construct live authentication instances.

#### Scenario: Deterministic dependencies replace production dependencies

- **WHEN** a test supplies database and authentication implementations at their runtime composition boundary
- **THEN** the same operation contracts execute with those implementations without acquiring hidden production dependencies

#### Scenario: Existing authored declarations compile

- **WHEN** an existing supported database/auth declaration is compiled without starting the application
- **THEN** its public types and normalized graph remain compatible and no client factory or auth factory is executed

### Requirement: Specialized activation has explicit ownership

Shared activation SHALL deduplicate acquisition within its existing owner, isolated activation SHALL remain independent, and failed acquisition SHALL permit a later attempt. Auth SHALL borrow its database without disposing it. Closing a database owner SHALL release owned resources once after admitted work has safely finished or been cancelled; shutdown and interruption SHALL NOT leave coordination permits stranded or permit resources to escape a closed owner.

#### Scenario: Concurrent shared activation fails then recovers

- **WHEN** concurrent callers share an acquisition that fails and a later caller retries
- **THEN** the first callers observe the failure, the failed acquisition is not retained indefinitely, and the later caller can acquire a healthy instance

#### Scenario: Isolated auth activation is used

- **WHEN** a runtime requests isolated auth activation
- **THEN** it receives an independent native auth instance without replacing the shared descriptor handler or closing the database it borrows

#### Scenario: Owner closes during an uncancellable native call

- **WHEN** shutdown begins while an admitted native database call cannot be cancelled
- **THEN** resource release and admission of conflicting work wait for a safe completion boundary, and the implementation does not claim that interruption cancelled the native call

### Requirement: Transaction failures preserve coordination and causes

Transactions SHALL preserve database and dialect semantics, serialize conflicting work at the actual client boundary, release coordination after acquisition, callback, commit, rollback, or interruption failure, and retain meaningful primary and cleanup failure information. Non-idempotent transactions SHALL NOT be retried automatically.

#### Scenario: SQLite begin fails

- **WHEN** SQLite rejects transaction begin
- **THEN** the failure reaches the caller and a later transaction can acquire coordination rather than waiting forever

#### Scenario: Rollback also fails

- **WHEN** a transaction callback fails and rollback fails during cleanup
- **THEN** the callback failure remains diagnosable together with the cleanup failure and the coordinator does not remain locked

#### Scenario: Transaction models execute

- **WHEN** a custom model operation executes inside a transaction
- **THEN** it receives the transaction-bound database and retains existing argument, return, and override behavior

### Requirement: Specialized operations are independently observable

Independently callable database and authentication operations SHALL emit correlated operation outcomes, durations, applicable workload metrics, and structured lifecycle/failure logs through the configured application instrumentation. Instrumentation SHALL distinguish success, typed failure, defects, and interruption, use bounded metric labels, avoid duplicate compatibility-wrapper counting, respect log-level configuration, and exclude credentials, cookies, tokens, query values, and sensitive rows.

#### Scenario: Standalone operation fails

- **WHEN** an operation executes outside a larger enclosing workflow and fails
- **THEN** its configured diagnostics record the operation and failure outcome without exposing sensitive inputs or changing its failure semantics

#### Scenario: Child log threshold is overridden

- **WHEN** an owned child workflow uses a local log threshold override
- **THEN** it retains inherited correlation context while the parent and sibling thresholds remain unchanged

#### Scenario: Compatibility adapter calls an operation

- **WHEN** a public Promise adapter invokes an instrumented service operation
- **THEN** each operation is counted once and the adapter preserves its public error and return contract
