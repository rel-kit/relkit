## Why

The specialized database and authentication packages still coordinate runtime activation and failures primarily through Promises and mutable state. Applying the use-effect architecture will make dependencies replaceable, resource ownership explicit, and operations independently observable while preserving RELKIT's public authoring contracts; the empty standard-provider package also needs an evidence-based purpose decision.

## What Changes

- Review every authored TypeScript file under `packages/drizzle`, `packages/better-auth`, and `packages/providers-standard`, including package-root tests and configuration. The request names three packages; no fourth package is assumed.
- Introduce cohesive Effect services with live/test Layers for database and auth runtime workflows, typed failures and boundary validation, scoped activation/disposal, and useful operation metrics, traces, and structured logs. Keep synchronous authoring and required Promise interfaces as compatibility boundaries.
- Correct lifecycle hazards, including failed SQLite transaction acquisition stranding subsequent work, with deterministic failure/interruption coverage.
- Preserve public model inference, `zodSchemas`, dialect/transaction behavior, auth session and route semantics, lazy compilation, and public error compatibility. Review all requested Effect capability families and adopt only those supported by actual domain needs.
- Audit `providers-standard` consumers, package/release tooling, and public history. Retain its empty compatibility surface for this change if removal would break consumers; do not invent a runtime service for an empty module.
- Organize implementation into a shared-contract phase, conditional parallel package work, ordered integration (`drizzle` → `better-auth` → `providers-standard`), and final repository/demo acceptance. Require an independent use-effect reviewer to inspect every changed TypeScript file at each phase boundary.
- Replay the existing offline E2E and browser checks in `/Users/mustafaelsayed/Workspace/relkit-regression-demo`, plus focused database/auth lifecycle coverage, against the actual changed framework build. Record historical diagnostic failures separately and preserve prior evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `domain-services`: Require substitutable specialized runtime dependencies, explicit activation/resource ownership, safe transaction failure recovery, and independently observable database/auth operations while retaining current public contracts.
- `acceptance-verification`: Require complete specialized-package TypeScript coverage, independent per-phase review, and fresh repository plus linked-demo acceptance of this migration.

## Impact

Primary scope is the 18 current authored TypeScript files across the three named packages, plus new service/type/schema companions and package-root tests. Necessary integration touchpoints include runtime activation consumers, compiler/type/generator fixtures, package exports and build/test orchestration, and generated documentation via existing generators. Shared files have one integration owner.

The pinned and installed Effect version is `4.0.0-rc.115`. The existing `repos/effect` directory lacks core Effect implementation/test files, so available vendor usages and installed version-matched sources must be used with explicit evidence gaps. No dependency upgrade is planned. This proposal creates planning artifacts only; implementation, real demo replays, and their reviewer gates are subsequent tasks. Paid model calls and cloud acceptance are separate opt-in checks, not prerequisites for the offline migration gate.
