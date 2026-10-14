## MODIFIED Requirements

### Requirement: Source-scoped IDs are derived deterministically

When an eligible source-scoped descriptor omits `id`, the compiler SHALL derive one filesystem-safe stable ID from its descriptor kind, logical service-relative convention hierarchy, export or local binding, service membership, and route method/path as applicable; an explicit ID SHALL always override inference. Moving a complete service from `src/<service>/` to `src/services/<service>/` without changing its declarations SHALL preserve public and private identities, category stripping, selectors, references, and member names. Physical source locations SHALL remain accurate and SHALL NOT be rewritten to fictional flat locations.

#### Scenario: Route ID is inferred

- **WHEN** `src/routes/orders/[orderId]/route.ts` exports `GET` without an ID
- **THEN** the resolved route ID is the safe canonical equivalent of `route.get.orders.by-order-id` while its displayed operation remains `GET /orders/{orderId}`

#### Scenario: Function ID is inferred

- **WHEN** a named `getOrder` function descriptor under the `orders` source hierarchy omits its ID
- **THEN** the compiler resolves a stable ID equivalent to `orders.get-order`, using the default-export file stem when no named binding exists

#### Scenario: Service member ID is inferred

- **WHEN** service `orders` contains member `getOrder` whose function has no explicit ID
- **THEN** the compiler resolves the member function ID as `orders.get-order`

#### Scenario: Error ID is inferred

- **WHEN** `const InvalidError = defineError(...)` is statically identifiable under the `orders` hierarchy
- **THEN** its resolved ID is equivalent to `orders.InvalidError`

#### Scenario: Inference is ambiguous

- **WHEN** an eligible descriptor has neither an explicit ID nor one statically identifiable binding, export, service member, or route operation
- **THEN** compilation fails with a source-located diagnostic requiring an explicit ID

#### Scenario: Two IDs collide

- **WHEN** explicit and inferred identities normalize to the same global ID
- **THEN** `RELKIT_DUPLICATE_ID` identifies every origin and no activatable output is emitted

#### Scenario: Complete service moves beneath grouping directory

- **WHEN** equivalent flat and grouped fixtures contain explicit IDs, named/default exports, private functions, local errors, tasks/jobs, tools, agents, and public service members
- **THEN** their logical IDs and references agree without a `services.` prefix, executable lookup uses those IDs, and diagnostics/source maps report each fixture's actual paths

### Requirement: Incremental compilation preserves full-build truth

Watch-mode compilation SHALL invalidate only affected discovery, descriptor, graph, and generated-output dependencies while producing the same diagnostics, canonical bytes, hash, and activatable outputs as a clean full compilation of the same source state. Dependency tracking SHALL include layout evidence, service moves, boundary additions/deletions, imported ordinary helpers, Platform configuration fragments, environment contracts, and relevant project module-resolution settings. Cache compatibility SHALL include the layout interpretation needed to prevent reuse under obsolete ownership rules.

#### Scenario: One descriptor changes during watch mode

- **WHEN** an affected descriptor and its dependants are incrementally recompiled
- **THEN** the result is byte-identical to an immediate clean full compile, unaffected generated files are not rewritten, and stale candidates cannot reuse invalid cached output

#### Scenario: Layout or an imported support module changes

- **WHEN** a service moves, a boundary appears or disappears, or an imported helper, configuration fragment, environment contract, or alias definition changes
- **THEN** the affected caches and prepared snapshots are invalidated and incremental results agree with a clean compile of that final state

## ADDED Requirements

### Requirement: Layout interpretation is consistent and path safe

Compiler outputs and downstream tooling SHALL agree on the application root, selected layout, service owner, public boundary, layer, and service-relative source path. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Interpretation SHALL be deterministic for supported separators, absolute/project-relative inputs, trailing separators, and enumeration order. Traversal outside the application source roots, ambiguous case-colliding service roots, and symbolic-link aliases that duplicate service ownership or bypass a layer boundary SHALL be rejected with source-located diagnostics. Ordinary helper files SHALL not be independently evaluated as descriptors. Naming/category convention warnings SHALL remain distinct from fatal structural or semantic errors.

#### Scenario: Portable path forms are supplied

- **WHEN** equivalent supported path forms identify the same application source
- **THEN** ownership and logical identities agree and all exposed locations are normalized project-relative paths

#### Scenario: Path alias escapes or duplicates ownership

- **WHEN** traversal, a case collision, or a symbolic link would escape a source root or assign the same source to multiple services
- **THEN** compilation rejects the ambiguity before emitting activatable output and does not silently omit boundary validation

#### Scenario: Only a convention differs

- **WHEN** a supported descriptor uses a nonrecommended filename or category folder without violating a semantic rule
- **THEN** its convention diagnostic remains nonfatal and ordinary helper folders introduce no registration mechanism

### Requirement: Boundary analysis resolves supported source dependencies

Boundary validation SHALL apply project TypeScript module-resolution settings, including inherited configuration and aliases, to static imports, type-only imports, re-exports, and string-literal dynamic imports. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Supported `.js` specifiers targeting TypeScript sources SHALL retain resolution. Each traversed application dependency SHALL retain its true owner across helper and re-export chains. Unresolved or computed dynamic imports SHALL receive an explicit analysis-limit diagnostic rather than being represented as verified boundary-safe dependencies.

#### Scenario: Alias or literal dynamic import targets internals

- **WHEN** a project alias, `.js` specifier, re-export, or literal dynamic import resolves across a forbidden application boundary
- **THEN** the same boundary error is reported as for the equivalent direct relative import

#### Scenario: Dynamic target cannot be resolved

- **WHEN** a dynamic import target depends on runtime computation or cannot be resolved statically
- **THEN** diagnostics identify the source and the unverified boundary with a recommendation to use a resolvable literal or explicit service boundary

### Requirement: Platform configuration fragments retain explicit composition

The configuration loader SHALL support explicitly imported modules under `src/platform/config/` and environment contracts under `src/platform/` without automatically discovering configuration fragments or adding provider registration APIs. All remaining normative obligations below SHALL also hold.

#### Scenario: All normative obligations are evaluated

- **WHEN** implementation or final acceptance evaluates this requirement
- **THEN** all of the following remaining obligations hold:

Loading configuration and discovering descriptors SHALL NOT acquire database clients, construct live auth instances, call model providers, or provision resources. Application environment contracts, provider binding references, dotenv loading, and CLI environment selection SHALL retain their existing separate meanings, including reserved `RELKIT_ENV` behavior.

#### Scenario: Explicit provider fragment is imported

- **WHEN** `relkit.config.ts` imports Platform server, Inspector, telemetry, deployment, or provider configuration fragments
- **THEN** compilation uses the composed declarations and records their dependencies without activating providers or changing public configuration shapes

#### Scenario: Unimported fragment or environment example exists

- **WHEN** an unimported Platform fragment or `.env.staging.example` is present and a CLI environment is selected
- **THEN** its presence alone neither registers configuration nor loads that example file as runtime environment
