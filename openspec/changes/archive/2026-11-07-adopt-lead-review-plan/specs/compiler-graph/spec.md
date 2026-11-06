# Spec Delta

## ADDED Requirements

### Requirement: Source-scoped IDs are inferred except for public contracts

When an eligible source-scoped descriptor omits `id`, the compiler SHALL derive one filesystem-safe
stable ID from its descriptor kind, service-relative hierarchy, export or local binding, service
membership and route method and path as applicable; an explicit ID SHALL always override inference.
Errors, events, buckets, caches, channels and tasks SHALL require explicit IDs. Moving a service
between layouts SHALL preserve identities, and source locations SHALL stay accurate.

#### Scenario: Route ID is inferred

- **WHEN** `src/routes/orders/[orderId]/route.ts` exports `GET` without an ID
- **THEN** the resolved route ID is the safe canonical equivalent of `route.get.orders.by-order-id`
  while its displayed operation remains `GET /orders/{orderId}`

#### Scenario: Function ID is inferred

- **WHEN** a named `getOrder` function descriptor under the `orders` source hierarchy omits its ID
- **THEN** the compiler resolves a stable ID equivalent to `orders.get-order`, using the
  default-export file stem when no named binding exists

#### Scenario: Service member ID is inferred

- **WHEN** service `orders` contains member `getOrder` whose function has no explicit ID
- **THEN** the compiler resolves the member function ID as `orders.get-order`

#### Scenario: Error ID is omitted

- **WHEN** `const InvalidError = defineError(...)` omits `id`
- **THEN** compilation fails with a source-located diagnostic that requires an explicit ID, because
  an error's ID is its public code

#### Scenario: Inference is ambiguous

- **WHEN** an eligible descriptor has neither an explicit ID nor one statically identifiable binding,
  export, service member, or route operation
- **THEN** compilation fails with a source-located diagnostic requiring an explicit ID

#### Scenario: Two IDs collide

- **WHEN** explicit and inferred identities normalize to the same global ID
- **THEN** `RELKIT_DUPLICATE_ID` identifies every origin and no activatable output is emitted

#### Scenario: Complete service moves beneath grouping directory

- **WHEN** equivalent flat and grouped fixtures contain explicit IDs, named/default exports, private
  functions, local errors, tasks/jobs, tools, agents, and public service members
- **THEN** their logical IDs and references agree without a `services.` prefix, executable lookup
  uses those IDs, and diagnostics/source maps report each fixture's actual paths

### Requirement: Third-party schema projection

The compiler SHALL project third-party Standard Schema contracts in the input and output directions
the graph needs, canonicalize the projected JSON, and include each schema library's version in the
build fingerprint.

#### Scenario: Validator upgrade

- **WHEN** the installed Zod version changes
- **THEN** the build fingerprint changes and the next check projects the affected schemas again

#### Scenario: Stable projection

- **WHEN** the same schemas are compiled twice with the same library versions
- **THEN** the projected JSON and the graph hash are identical

## REMOVED Requirements

### Requirement: Source-scoped IDs are derived deterministically

**Reason**: Replaced by "Source-scoped IDs are inferred except for public contracts", which requires
explicit IDs for errors because an error's ID is its public code.

**Migration**: Add an explicit `id` to each `defineError`; `relkit migrate` writes the previously
inferred ID so public error codes do not change.

### Requirement: Portable validated development snapshot

**Reason**: The warm incremental development loop (`development-loop`) replaces the prepared-start
snapshot cache.

**Migration**: None for applications; `relkit dev --prepare` keeps working as a finite check without
snapshot publication.

### Requirement: Complete snapshot invalidation

**Reason**: The warm incremental development loop (`development-loop`) replaces the prepared-start
snapshot cache.

**Migration**: None for applications; `relkit dev --prepare` keeps working as a finite check without
snapshot publication.

### Requirement: Snapshot integrity before execution

**Reason**: The warm incremental development loop (`development-loop`) replaces the prepared-start
snapshot cache.

**Migration**: None for applications; `relkit dev --prepare` keeps working as a finite check without
snapshot publication.

### Requirement: Atomic snapshot publication and immutable execution

**Reason**: The warm incremental development loop (`development-loop`) replaces the prepared-start
snapshot cache.

**Migration**: None for applications; `relkit dev --prepare` keeps working as a finite check without
snapshot publication.
