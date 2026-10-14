# Packed diagnostic setup attempt

Command: `bun scripts/benchmark-packed-dev.ts --runs 2 --set diagnostic --output openspec/changes/adopt-grouped-service-layout/evidence/packed-diagnostic.json`.

The candidate packages and generator installed outside the workspace. Minimal
creation failed during finite development preparation with
`RELKIT_CREATE_PREPARE_FAILED`; the staging directory was cleaned. No measured
development launch occurred, so this is setup failure evidence rather than a
readiness sample or a passing certification result.

The checker now rejects unsafe external declaration/configuration inputs instead
of silently issuing reusable evidence. Generated configurations therefore declare
their installed type roots explicitly. Existing applications with external inputs
retain ordinary checking and cannot use an unsafe prepared cache.
