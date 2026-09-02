## 1. Authoring contracts

- [x] 1.1 Add branded capability adapters, ownership wrappers, provider topology types, and strict secret-reference validation.
- [x] 1.2 Replace `ProviderSets` and provider recipes in `defineApp` with one topology and reserve `RELKIT_ENV` in environment schemas.
- [x] 1.3 Add focused public API, type, secret-safety, and bucket-profile uniqueness tests.

## 2. Compiler artifacts

- [x] 2.1 Replace provider graph nodes/edges with capability-profile adapter and ownership metadata plus value-free environment references.
- [x] 2.2 Update compiler normalization, validation, diffing, registration planning, and inspector API projections for provider bindings.
- [x] 2.3 Bump graph and manifest versions together, update manifest factory declarations, and regenerate compiler fixtures.

## 3. Runtime adapters and lifecycle

- [x] 3.1 Extract S3 signing/client behavior into a standard S3-compatible adapter with endpoint, region, credentials, path-style, cancellation, metadata, listing, and signed URLs.
- [x] 3.2 Extract RESP behavior into a Redis-compatible adapter supporting `redis://`, `rediss://`, authentication, JSON, TTL, deletion, and increment.
- [x] 3.3 Replace the global provider factory with independent capability/profile factory lookup and graph-required acquisition/release.
- [x] 3.4 Register jobs, events, models, and observability independently and prove credential/failure isolation.
- [x] 3.5 Make `@relkit/testing` override all required bindings with deterministic fakes by default and support explicit configured-adapter opt-in.

## 4. Deployment ownership

- [x] 4.1 Add project-owned deployment target/adapter configuration and remove hosting selection from application provider configuration.
- [x] 4.2 Bump the deployment-plan contract and include only managed bindings with value-free references.
- [x] 4.3 Update AWS Pulumi provisioning, environment injection precedence, workload identity, and IAM to omit external bindings.

## 5. Product migration

- [x] 5.1 Migrate CLI generation/runtime activation, doctor checks, templates, commerce, and canonical fixtures to one topology without `RELKIT_ENV` schemas.
- [x] 5.2 Update inspector provider views and links to show capability, profile, adapter, ownership, and safe references.
- [x] 5.3 Update provider, environment, deployment, testing, and migration documentation with MinIO/Redis, R2/Upstash, and managed AWS examples.
- [x] 5.4 Migrate `/Users/mustafaelsayed/Workspace/typescripts/my-relkit-app-7` to `external(s3(...))` and `external(redis(...))`, preserving unrelated user edits.

## 6. Verification

- [x] 6.1 Run shared S3/Redis contract matrices and focused authoring, compiler, runtime, testing, inspector, deployment, template, example, and documentation suites.
- [x] 6.2 Run repository typecheck/check/build/verify gates, report any environment-dependent cloud tests separately, and validate the OpenSpec change strictly.
