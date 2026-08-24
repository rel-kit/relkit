## Context

See [proposal.md](./proposal.md) for motivation. Today `@zsys/app` selects a `ProviderSet` by development/test/production and hands the selected recipe to one provider factory. The AWS factory receives configuration for every capability, while graph provider nodes contain only logical profiles and the deployment planner assumes every bucket/cache is AWS-managed. The existing AWS runtime already contains useful S3 signing and RESP implementations, but their lifecycle and credentials are coupled to the AWS recipe.

The redesign must preserve function-facing clients, deterministic compilation, secret-free generated artifacts, and the prior middleware work in the dirty tree. It is a clean break at the application configuration boundary.

## Goals / Non-Goals

**Goals:**

- Model each capability/profile binding independently from hosting and from other bindings.
- Make application topology invariant across pipeline environments.
- Reuse one S3 protocol implementation and one Redis protocol implementation across vendors.
- Keep resolved values at runtime/deployment injection boundaries only.
- Make deployment ownership mechanically visible and testable.
- Preserve existing bucket/cache clients and descriptor dependency declarations.

**Non-Goals:**

- Vendor-named R2, MinIO, Upstash, or Valkey presets.
- Automatically starting MinIO or Redis for local development.
- Provisioning external resources or importing them into Pulumi state.
- Compatibility aliases for provider recipes or environment branches.
- Expanding the bucket/cache operation contracts beyond current declared capabilities.

## Decisions

### One binding model for every capability

`defineApp.providers` is a capability-indexed topology. Each logical profile contains a branded binding:

```ts
external(s3({ ... }))
managed(redis({ ... }))
```

Bindings serialize as capability, profile, adapter, ownership, feature metadata, and environment references. Adapter constructors create data-only declarations; `external` and `managed` add ownership. Resource descriptors continue to carry only a logical profile.

This is preferred over keeping provider sets with different names because a branch still permits topology drift and keeps environment identity coupled to resource choice. It is preferred over putting adapters directly on resource descriptors because shared non-resource capabilities and deployment inspection need one application topology.

Jobs, events, models, and observability use the same binding representation even where their first adapters remain AWS-specific. This removes the global recipe without forcing a protocol abstraction where no useful interoperable protocol exists.

### Adapter fields distinguish public metadata from secret references

Adapter option values are restricted to JSON-safe literals and typed environment references. Credential-bearing fields require secret environment references at the type and runtime validation boundaries. Graph/manifest/plan projection serializes reference name, kind, and sensitivity only. Runtime resolution happens after the application environment is validated.

Endpoint and region fields may use non-secret environment references; Redis URLs and access-key fields must use secret references. This catches accidental literal credentials early and makes recursive artifact redaction testable.

### Standard protocol adapters own portable I/O

The existing S3 request signing/client logic and Redis RESP client move to a standard provider package with no AWS deployment dependency. S3 exposes endpoint, region, bucket name, optional credentials, and `forcePathStyle`; omission of credentials allows workload identity/default AWS credentials where the runtime supplies them. Redis accepts `redis://` and `rediss://`, including URL authentication.

The AWS runtime keeps SQS, EventBridge, model, and observability adapter factories, but registers them separately. This is preferred over leaving S3/Redis in the AWS package because package ownership otherwise continues to communicate the wrong composition model.

### Runtime resolution is a capability/profile matrix

The runtime builds a required-binding set from graph dependency edges. It looks up a factory by `(capability, adapter)`, resolves only that binding's environment references, constructs it once per generation, and stores the resulting client by `(capability, profile)`. Acquisition failures release already-created bindings in reverse order. Factories receive no global provider configuration.

`@zsys/testing` supplies an override factory matrix for all required bindings by default. Integration tests opt into configured adapter factories explicitly.

### Provider nodes are first-class graph nodes

Provider node identity includes capability and profile, avoiding cross-capability `default` collisions. Nodes include adapter, ownership, features, and value-free references. Resource/trigger/model relationships target these nodes. Compilation rejects unknown profiles and multiple bucket descriptors targeting the same bucket binding.

Graph and manifest versions move together because runtime factory lookup semantics change. Deployment-plan version also moves because ownership changes resource inclusion.

### Deployment is a filter and binding override

`zsys.config.ts` owns `deployment.target` and `deployment.adapter`. Planning filters provider nodes to `ownership === "managed"`; external bindings generate neither resources nor capability IAM statements. Supported managed bindings become target resources. Their outputs are injected at higher precedence than pipeline values for the referenced connection keys. Where the target can authenticate through workload identity, generated bindings omit static credentials.

External bindings are not copied into the provider-resource portion of the plan. Their environment keys remain ordinary workload inputs supplied by the pipeline.

### Migration is source-driven and atomic at the contract boundary

Public recipe exports and old signatures are removed in the same change as consumers migrate. Generated graph fixtures are regenerated through compiler commands rather than edited manually. The external `my-zsys-app-7` application is migrated after the repository packages are available through its workspace dependency setup.

## Risks / Trade-offs

- [Breaking surface spans compiler, runtime, and deployment] → Bump the contract cohort and add explicit old-version rejection before updating fixtures.
- [S3 vendors differ in addressing and signing details] → Make endpoint and path style explicit and run the same contract suite against AWS-style, R2-style, and MinIO-style endpoints.
- [Redis services expose protocol subsets] → Keep the cache contract small, validate commands through shared tests, and report unsupported behavior honestly.
- [Managed output precedence can hide pipeline mistakes] → Show safe source/precedence metadata in doctor and inspector, never values.
- [Independent acquisition changes lifecycle ordering] → Sort bindings canonically and release the exact acquired stack in reverse order.
- [Large dirty worktree overlaps templates/compiler/inspector] → Inspect diffs before each edit, make surgical patches, and never revert unrelated middleware changes.
- [No compatibility shim creates an all-at-once migration] → Update repository consumers and the requested external application in the same implementation and provide direct migration documentation.

## Migration Plan

1. Introduce binding/adapter declarations and graph contract types, then bump graph/manifest/plan versions.
2. Replace compiler normalization and validation, including secret-reference and bucket-profile uniqueness checks.
3. Extract/register S3 and Redis runtime factories and refactor provider registry acquisition to independent bindings.
4. Register remaining capability factories independently and update testing overrides.
5. Update project deployment configuration, plan filtering, AWS provisioning, environment injection, and IAM generation.
6. Migrate inspector, CLI/templates, commerce, fixtures, docs, and `my-zsys-app-7`.
7. Run focused suites followed by repository verification; because this is unreleased framework work, rollback is reverting the change as a cohort rather than supporting mixed artifact versions.
