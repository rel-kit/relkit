# Drizzle + Effect

Load only when the requested scope or its owning database adapter uses Drizzle.

## Official reference and version check

Read the [Drizzle Effect Schema guide](https://orm.drizzle.team/docs/effect-schema)
for the relevant operation. Its current entry point is `drizzle-orm/effect-schema`.
Inspect installed exports and compatibility with the project's pinned Effect;
older code may use `drizzle-effect-schema`. Verify that package's API rather
than changing imports or installing/upgrading packages from a current example.

## Apply at the database boundary

- `createSelectSchema` describes selected rows from tables/views and enum values;
  `createInsertSchema` and `createUpdateSchema` describe table writes. Use the
  appropriate generated contract, preserving defaults, generated columns,
  nullable fields, and partial updates.
- Override fields with replacement schemas, or refine a generated field using
  the callback form. Refinement runs before optional/nullable wrapping. Decode
  unknown inputs with `Schema.decodeUnknownEffect` inside Effect workflows.
- Keep schema generation distinct from query execution. Group persistence
  operations in a domain repository Service with live/test Layers. Reuse an
  existing Effect query adapter; otherwise bridge rejecting Promise queries
  with `Effect.tryPromise` and typed tagged failures. Propagate cancellation only
  where the driver supports it; preserve transaction and resource lifetimes.
- Keep persistence schemas in appropriate `.schemas.ts` companions and derive
  `.types.ts` contracts. Preserve differences between stored rows and public
  domain models. Apply the main skill's documentation and observability rules.

Verify Effect Schema behavior against `<project-root>/repos/effect`, using the
Schema/parser source and tests indexed in `api-selection.md`. Verify Drizzle
behavior against installed source or an existing matching vendor checkout;
`repos/effect` does not establish third-party package compatibility.

Under the owner's root `tests/`, use Vitest with `@effect/vitest` for changed
decode/write behavior, defaults/nullability, and repository failure/cleanup.

## Transaction and adapter guarantees

For changes involving concurrent writes, persisted workflows, or custom schema
factories, apply the relevant [behavioral contracts](contracts-and-testing.md):

- Identify which reads/writes and ledger/outbox changes must commit together.
  Keep transaction handles within their owner lifetime. Local interruption
  masking does not provide database atomicity or rollback.
- Verify the actual conflict/ownership protocol: missing-row locking, unique
  constraints, compare-and-set predicates, and lock order differ from ordinary
  reads. Guard settlement against stale ownership when the contract requires it.
- Retry only structurally recognized, replay-safe failures with bounded policy.
  Inspect the installed driver's wrapped error/Cause shape; do not classify
  deadlocks or transaction safety through arbitrary rendered-message matches.
  Preserve unrelated failures, defects, and interruption.
- Keep durable mutations authoritative and coordinate notifications with commit.
  A best-effort wake may use recovery polling; a failed write must remain visible.
  Test competing writes and the changed commit/notification crash window.
- Preserve the application's existing migration owner. When code derives or
  customizes schema/DDL, verify changed columns/defaults/nullability and indexes
  against actual migrated tables, including batch and alternate insert paths.
- If application time governs persisted eligibility, bind injected Clock time
  for deterministic tests against real storage. Preserve an existing requirement
  for database-authoritative time; use live coverage for driver/network behavior.

Do not add lock protocols, outbox tables, migrations, or a second migration system
to an unrelated schema/service refactor. Exercise guarantees the scoped change
actually owns and use the project's pinned Drizzle/Effect APIs.
