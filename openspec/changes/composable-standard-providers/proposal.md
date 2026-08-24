## Why

ZSYS currently couples application resources, runtime adapters, deployment ownership, and environment names into provider recipes such as `awsProviders`, which makes valid compositions such as AWS hosting with R2 storage misleading or impossible. Applications need one portable topology whose connection values come from pipelines and whose capabilities can be owned and instantiated independently.

## What Changes

- **BREAKING** Replace environment-specific provider sets and recipes with one `providers` topology composed from protocol adapters and explicit `external(...)` or `managed(...)` ownership.
- Add standard `s3(...)` and `redis(...)` adapters for S3-compatible object stores and Redis-compatible caches.
- Resolve and instantiate bindings independently by capability and logical profile, with deterministic in-memory testing overrides.
- **BREAKING** Reserve `ZSYS_ENV` for the framework and remove it from generated application schemas; pipelines provide different values for identical declared keys.
- **BREAKING** Separate deployment target/adapter selection into `zsys.config.ts` and version provider-aware graph, manifest, and deployment-plan contracts together.
- Provision only managed bindings; external bindings retain pipeline values and produce no resources or IAM statements.
- Enforce environment-reference-only secret adapter fields and one-to-one bucket descriptor/profile ownership.
- Migrate templates, examples, inspector, documentation, tests, and `my-zsys-app-7` to the new topology without compatibility shims.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-authoring`: Replace environment provider branches with composable protocol bindings and pipeline-owned environment values.
- `managed-resources`: Define independent capability/profile binding resolution, S3/Redis adapters, ownership, and test overrides.
- `compiler-graph`: Represent value-free provider bindings and bump graph/manifest contracts together.
- `function-runtime`: Instantiate only graph-required bindings and isolate capability credentials and failures.
- `jobs-events`: Resolve job and event providers as independent bindings.
- `tools-agents`: Resolve model providers as an independent binding rather than an environment recipe.
- `observability`: Resolve observability independently from other capability providers.
- `cli-scaffolding`: Generate and validate single-topology applications without application-declared `ZSYS_ENV`.
- `development-inspector`: Display adapter and ownership metadata for provider bindings without exposing values.
- `pulumi-aws-deployment`: Configure hosting separately and provision only managed bindings in a bumped plan contract.
- `acceptance-verification`: Add protocol conformance, isolation, external/managed deployment, migration, and security coverage.

## Impact

This changes public exports in `@zsys/app`, provider runtime registration, compiler/graph/manifest schemas, CLI generation and activation, testing defaults, inspector APIs/views, AWS Pulumi planning, all templates and canonical fixtures, and provider documentation. Existing applications using provider recipes must migrate to explicit bindings; there is intentionally no compatibility layer.
