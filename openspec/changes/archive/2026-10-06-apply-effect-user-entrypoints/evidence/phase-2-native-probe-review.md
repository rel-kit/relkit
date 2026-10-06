# Independent native declaration probe review

Reviewer: `/root/plan_cli`. Scope: phase-two native compatibility compiler probes,
reviewed separately from the author. No task status is changed by this evidence.

## Reviewed TypeScript coverage

- `integrations/packages/effect-mq/tests/postgres-declarations.ts`
- `integrations/packages/effect-mq/tests/postgres-declarations.test.ts`

Both files were read through EOF, including the virtual compiler host, positive
consumer fixture, every `@ts-expect-error`, and both deliberate failure-channel
mutations. Coverage: **2/2 changed TypeScript files** in this review scope.

## Findings

No actionable findings. The compiler uses strict dependency checking with
`skipLibCheck: false`, `exactOptionalPropertyTypes`, and no emission. Its virtual
host supplies only the consumer source; dependency declarations resolve from the
actual installed package graph. It preserves typed SQL failures and required
PgClient/Scope environments. The negative mutations detect both `any` widening
and disappearance of `SqlError`, while unused `@ts-expect-error` diagnostics
prevent silent environment erasure from passing.

The test boundary uses the installed stable Effect test runner and `Effect.sync`
for compiler inspection. The compiler helper is a pure diagnostic operation and
does not need a domain service, cache, Ref, or scoped resource lifetime. This is
consistent with the approved phase-two minimal compatibility scope and the
Use Effect pure-leaf exception.

## Verification boundary

The coordinator owns the native suite results. This review accepts the probe
design; source and packed clean-consumer gate outcomes are recorded separately.
The packed gate additionally installs from actual tarball registry metadata with
an isolated cache, delivers the declaration patch from the packed generator
asset, and checks the published native Effect identity's literal type.
