## Context

See `proposal.md` for motivation. The reconciled baseline currently has one application topology with `external`/`managed` provider bindings, executable provider factories embedded in the runtime manifest, environment-name-based test replacement, AWS/Pulumi defaults in generated projects, a single observability binding plus special Sentry handling, and CloudWatch represented in application provider configuration even though AWS hosting routes structured stdout.

The compiler, runtime, development supervisor, Inspector, deployment planner, examples, templates, and documentation all consume those contracts. The repository is pre-1.0 and under active development, so retaining two provider models would add more risk than a clean contract cohort break.

## Goals / Non-Goals

**Goals:**

- Give application authors one concise `defineApp` topology that works across local development, tests, connected services, and infrastructure-owned resources.
- Separate portable adapter behavior, connection materialization, local services, deployment ownership, access, and runtime implementations.
- Make integration installation minimal, deterministic, statically resolvable, and reproducible from the lockfile.
- Keep binding-local connection outputs distinct from handler-visible application environment values.
- Preserve last-known-good development, secure local state, complete Inspector telemetry, provider-neutral planning, and explicit test behavior.
- Make every generated artifact and activation participant part of one verified version cohort.

**Non-Goals:**

- Compatibility aliases, automatic migration, or readers for previous public, graph, manifest, or deployment contracts.
- Runtime callbacks, arbitrary module paths, filesystem discovery, remote plugin installation, marketplaces, or sandboxing installed integration code.
- Connected-resource provisioning, deletion, or implicit access-grant management in v1.
- A direct CloudWatch telemetry exporter.
- A second deployment engine beyond the Pulumi integration in this implementation.
- Paid or mutating cloud acceptance without separate authorization.

## Decisions

### 1. `defineApp` owns one canonical topology

The public application shape uses singular capability keys and accepts either a direct binding or profile map:

```ts
type ProviderInput<Binding> =
  | Binding
  | Readonly<Record<string, Binding>>;
```

A direct binding normalizes to profile `default`. Profile resolution order is descriptor selection, `defaults.<capability>`, automatic sole-profile selection, then an ambiguity diagnostic. Logical cache and bucket descriptors retain their own IDs and namespaces; profiles name physical servers or services.

```ts
export default defineApp({
  cache: {
    requests: docker(redis({ url: env.secret("REQUESTS_CACHE_URL") })),
    timeline: docker(redis({ url: env.secret("TIMELINE_CACHE_URL") })),
  },
  defaults: { cache: "requests" },
});
```

Alternative considered: preserve `defineConfig` as an alias. Rejected because it would keep two documented contracts and obscure the intentional cohort break.

### 2. Application environment and binding values use separate contracts

`defineEnv` remains the handler-visible contract:

```ts
const appEnv = defineEnv({
  PUBLIC_ORIGIN: env.url(),
});
```

Named `env` helpers used directly in integration options create `BindingValueRef` descriptors:

```ts
redis({ url: env.secret("CACHE_URL") });
```

The overload is syntactically small but semantically strict: unnamed helpers inside `defineEnv` declare an application field; named helpers in integration configuration declare a binding-local runtime value. Provider adapter types accept binding refs and literals but not handler environment field tokens. Local and infrastructure outputs satisfy binding refs only and never populate `ctx.env`.

Alternative considered: expose `connection.secret(...)` or a nested `connection` object. Rejected because it adds authoring ceremony without improving runtime isolation.

### 3. The normalized binding separates adapter, source, local overlay, and access

The pure provider protocol owns a JSON-safe normalized form equivalent to:

```ts
interface ProviderBindingPlan {
  readonly capability: string;
  readonly profile: string;
  readonly adapter: {
    readonly integrationId: string;
    readonly adapterId: string;
    readonly protocolVersion: 1;
    readonly behavior: JsonValue;
    readonly connectionContract: JsonValue;
    readonly features: readonly string[];
  };
  readonly source:
    | { readonly kind: "connected" }
    | { readonly kind: "local-only" }
    | { readonly kind: "infrastructure"; readonly integrationId: string; readonly options: JsonValue };
  readonly local?: {
    readonly integrationId: string;
    readonly recipeId: string;
    readonly recipeVersion: number;
  };
  readonly access?: JsonValue;
}
```

Adapter behavior is separate from declared connection fields. Local and infrastructure materializers can fill only connection fields. A field supplied both authoritatively and by authored configuration is a compile error unless the adapter contract marks the authored value as a fallback.

Binding resolution order is local override, infrastructure output, named runtime value, adapter fallback, then adapter default. Diagnostics name capability, profile, binding, and field while redacting values.

Access remains binding/infrastructure metadata. A configured connected adapter receives supplied credentials or external workload identity; RelKit v1 does not invent connected-service IAM. Infrastructure integrations generate explicit access operations.

### 4. Three public source forms replace ownership wrappers

```ts
redis({ url: env.secret("CACHE_URL") });
docker(redis());
docker(redis({ url: env.secret("CACHE_URL") }));
aws(s3({ signedUrlTtlSeconds: 900 }), { versioning: true });
```

- Configured plain adapter: connected release service.
- `docker(unconfiguredAdapter)`: local-only; release validation fails.
- `docker(configuredAdapter)`: Docker under local commands and connected service otherwise.
- Infrastructure wrapper: provisioned release source plus the adapter's declared default local recipe.

`docker()` only returns a frozen descriptor. It performs no I/O. Infrastructure wrappers dispatch by adapter/capability contract rather than requiring `aws.s3(...)` provisioner objects. `docker(aws(s3()))`, nested source wrappers, and unconfigured plain adapters are rejected.

Alternative considered: public `connect()` and `provision()` wrappers. Rejected because configured adapters already express connection and infrastructure integrations can express provisioned ownership directly.

### 5. Integrations are standalone packages with one optional catalog

The workspace adds:

```text
integrations/
  catalog/                 @relkit/integrations
  packages/
    redis/                 @relkit/redis
    s3/                    @relkit/s3
    docker/                @relkit/docker
    local/                 @relkit/local
    cloudflare/            @relkit/cloudflare
    ai-sdk/                @relkit/ai-sdk
    sentry/                @relkit/sentry
    otlp/                  @relkit/otlp
    aws/                   @relkit/aws
    pulumi/                @relkit/pulumi
```

`@relkit/local` owns generic local-service planning, state, and orchestration. `@relkit/docker` owns the `docker()` source descriptor and Docker materializer. Adapter packages expose authoring constructors, runtime exports, and optional local-recipe exports. The catalog provides side-effect-free subpath re-exports, so `@relkit/integrations/redis` and `@relkit/redis` expose the same constructor.

Core packages depend only on provider, local-service, telemetry, and deployment protocols. Generated runtime code imports selected standalone subpaths; it never imports the whole catalog. Existing wildcard workspace and Konsistent rules apply to each integration package without exceptions.

### 6. Static integration resolution has an explicit trust boundary

Each branded constructor carries a stable integration ID owned by its package. Package metadata maps that ID to authoring, runtime, local-recipe, host, infrastructure, or deployment-engine exports. Resolution verifies:

1. The application did not author an import path.
2. The selected export is present in the package `exports` map.
3. Resolution remains inside the package root.
4. Runtime metadata matches integration ID, capability, adapter, and protocol version.
5. `(capability, adapter)` runtime registrations are unique.
6. Package version, selected export, and lockfile provenance are recorded.
7. Generated imports are stable-sorted.

Installing an integration grants it build/runtime code execution. RelKit validates structural identity and compatibility but does not sandbox the package.

Alternative considered: dynamic plugin discovery. Rejected for reproducibility, security, bundling, and conflict-resolution reasons.

### 7. Generated execution domains have separate plans

`runtime-integrations.plan.json` v1 contains provider runtimes and telemetry exporters:

```ts
interface RuntimeIntegrationPlanV1 {
  readonly version: 1;
  readonly graphHash: string;
  readonly integrations: readonly {
    readonly integrationId: string;
    readonly capability: string;
    readonly adapterId: string;
    readonly protocolVersion: number;
    readonly packageName: string;
    readonly packageVersion: string;
    readonly exportName: string;
  }[];
}
```

`local-services.plan.json` v1 contains non-secret recipe references, binding IDs, safe recipe configuration, and its graph relationship. `deployment-plan.json` v3 contains engine, host, connected bindings, infrastructure operations, and access operations. None contains resolved secrets or live objects.

The runtime manifest contains executable application handlers and a reference to the runtime-integration plan, not provider factories. Static imports are generated into runtime source from the verified plan.

### 8. Activation verifies the complete cohort

The supervisor and production startup use:

```ts
interface RuntimeActivationFingerprint {
  readonly graphHash: string;
  readonly manifestHash: string;
  readonly runtimeIntegrationsPlanHash: string;
  readonly localServicesPlanHash?: string;
  readonly providerOverridesGeneration?: string;
}
```

The local flow is compile graph/manifest/plans, reconcile required services, write an override generation, start the candidate with expected identities, verify readiness, then switch the proxy. Any mismatch preserves the last-known-good generation.

Version cohort:

| Contract | Version |
| --- | ---: |
| Public contract | 5 |
| Generator | 5 |
| Graph | 8 |
| Runtime manifest | 8 |
| Deployment plan | 3 |
| Provider protocol | 1 |
| Runtime integration plan | 1 |
| Local service plan | 1 |
| Provider override state | 1 |
| Inspector API | 1, additive fields only |

All previous graph, manifest, deployment, and provider formats are rejected with regeneration diagnostics. No compatibility reader is retained.

### 9. Runtime construction and tests use the same registry rules

Runtime validates the activation cohort, resolves binding values, loads graph-required static integrations, constructs each selected binding once, registers handlers/resources/triggers, becomes ready, drains, and releases in reverse dependency order. Unused bindings do not load code or require values.

The production registry has no environment-name branch. Tests use:

```ts
createTestApplication(app, {
  providers: {
    cache: {
      requests: createTestCacheFake(),
    },
  },
});
```

Missing replacements follow normal binding resolution and fail clearly. Integration tests explicitly start local services or opt into configured services.

### 10. Local services are owned by the development session

`relkit check` writes the deterministic plan but never contacts Docker. `relkit dev` starts graph-required bindings; `relkit local up` starts all declarations; `relkit dev --local=off` starts none. Build, production start, deployment, and ordinary tests ignore recipes.

`localProjectId` is the hash of canonical real project root plus stable application ID. Docker labels include managed marker, app ID, local project ID, binding ID, recipe ID, and plan hash. One attached project lease is stored under `.relkit/state/local`; dead-process leases are recoverable. Worktrees and clones cannot adopt each other.

Redis defaults:

- Pinned official Redis-compatible image.
- Container port 6379 with random loopback host port.
- `redis-cli PING` health check.
- Generated binding-local Redis URL.
- Named persistent volume.
- No authentication for the loopback-only default.

S3 defaults:

- Pinned MinIO-compatible image.
- Random loopback API and administration ports.
- Generated local credentials held only in secure override state.
- Protocol health check before output publication.
- Named persistent data volume and path-style S3 behavior.

Unchanged healthy services survive hot reload. A changed plan reconciles only affected bindings. Attached development stops containers it started on exit but preserves volumes. Services that were already detached remain detached. `local up --detach` leaves adoptable services running. `local stop` refuses a live attached lease. `local reset` refuses a live lease, requires interactive confirmation or `--yes`, and removes only labeled project containers, volumes, and override state.

State directories use mode 0700 and files 0600 where supported, atomic rename, canonical path checks, and symlink/path-escape rejection. Secrets never enter labels, process arguments, logs, diagnostics, or generated plans.

### 11. Telemetry keeps complete local evidence before export sampling

Pipeline:

```text
runtime event
→ canonical record
→ capture policy
→ redaction
→ bounded Inspector persistence and live stream
→ root trace-consistent export sampling
→ exporter fan-out
```

Local retention remains independently bounded and normally unsampled. Logs use severity policy rather than trace sampling. Errors and diagnostics export unsampled by default. Sampling chooses a root trace once and children inherit it.

Exporter failure cannot fail application work. Failures and drops create redacted local-only diagnostics and counters that never recursively enter the failed exporter. Sentry owns SDK buffering and bounded flush. OTLP uses one RelKit-owned bounded queue and drops complete export units where possible.

CloudWatch Logs is deployment/host routing for the redacted structured stdout sink. No direct CloudWatch exporter is created, avoiding duplicate ECS log delivery.

### 12. Deployment separates engine, host, infrastructure, access, and wiring

Pulumi remains the first deployment engine and AWS ECS the first host, but neither implies ownership of application bindings. Plan v3 includes:

```ts
interface DeploymentPlanV3 {
  readonly version: 3;
  readonly graphHash: string;
  readonly engine: IntegrationReference;
  readonly host: IntegrationReference;
  readonly connectedBindings: readonly ConnectedBindingPlan[];
  readonly infrastructureOperations: readonly InfrastructureOperationPlan[];
  readonly accessOperations: readonly AccessOperationPlan[];
}
```

Connected bindings participate in value validation and runtime wiring but produce no lifecycle or implicit access operations. `aws(adapter, options)` emits infrastructure and access operations only for supported adapters. Outputs fill declared connection fields. The AWS host configures CloudWatch stdout routing independently.

Mixed plans such as AWS ECS plus connected Cloudflare KV/R2 or another future host plus connected AWS S3 remain valid. Unsupported infrastructure/adapter combinations fail before preview. Pure plan tests, Pulumi mocks, generated programs, and container tests are implementation gates; real cloud acceptance remains separately authorized.

### 13. Generator, Inspector, and documentation ship with the contract

Generator defaults become cloud-free and deploy-free. AWS and Pulumi require explicit selection. The default hello route needs neither Docker nor cloud credentials. Docker packages and recipes appear only when selected template capabilities need them.

Inspector API v1 receives additive fields for source, profile, integration provenance, local-service state, exporter health, sampling, and activation fingerprints. Browser payloads remain secret-free and implementation-free.

Documentation uses executable includes from templates and `examples/commerce`. Public JSDoc and CLI help remain the sources for generated references. Guide/feature catalogs own navigation and coverage. Generated navigation and reference MDX are never hand-edited.

The landing page reuses its current component/CSS system; it updates copy and executable examples rather than adding a redesign framework. It presents `defineApp`, local-only and connected Docker behavior, `aws(s3())`, standalone/catalog imports, and Inspector logs/traces.

### 14. The change lands as one contract cohort

The predecessor archive is the only independently mergeable baseline unit. Workspace shells and protocols may be reviewed gate by gate, but the new public contract is not released until integration packages, compiler plans, runtime, Docker, telemetry, deployment, generator, Inspector, examples, and documentation all agree on the new cohort.

No Git commits are created automatically. If commit authorization is later given, use three baseline/proposal review boundaries: predecessor archives, baseline validation adjustments, and the new OpenSpec change.

## Risks / Trade-offs

- **Large clean break can leave stale internal consumers** → Use repository-wide removed-symbol scans, version rejection, generated-project smoke tests, packed-package tests, and one final cohort gate.
- **Static integration metadata can drift from package exports** → Validate export maps, package roots, runtime-reported identity, duplicates, provenance, and deterministic imports at build and startup.
- **Binding-local values could accidentally leak into application environment or artifacts** → Keep distinct descriptor brands and resolvers; test duplicate names, graph serialization, logs, diagnostics, state permissions, and browser payloads.
- **Docker sessions can collide or remove another worktree's data** → Scope labels and leases by canonical local project ID; reject live leases; require confirmation for reset; touch only validated labeled resources.
- **Automatic local recipes can hide release incompleteness** → Ignore Docker outside local commands and fail release validation for local-only bindings.
- **Exporter sampling can damage Inspector diagnosis** → Persist redacted canonical records before export sampling and keep errors/diagnostics unsampled by default.
- **Catalog installation is heavier than standalone packages** → Keep the catalog optional and side-effect-free; generated code always imports selected standalone packages.
- **Infrastructure wrapper dispatch can become ambiguous** → Require one compatible infrastructure handler per adapter/capability/protocol version and reject duplicates before plan generation.

## Migration Plan

1. Archive and strictly validate all completed overlapping predecessor changes so main specs reflect checked-in behavior.
2. Add workspace/protocol shells and integration package boundaries without publishing the new public contract.
3. Implement authoring, compiler plans, versions, and stale-artifact rejection as one cohort.
4. Implement runtime integration loading and explicit test replacements.
5. Add local-service orchestration, telemetry exporters, deployment v3, Inspector metadata, and generator behavior.
6. Rewrite repository-owned examples, templates, documentation, landing content, JSDoc, and CLI metadata directly; do not generate compatibility code.
7. Run focused suites, packed/generator/docs/Docker verification, full repository checks, and release evidence review before enabling the new cohort.

Rollback before release is deletion of the unshipped cohort changes. After release, rollback requires reverting the entire versioned cohort and rebuilding applications; mixed old/new artifacts are never activated.
