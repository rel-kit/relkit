## 1. Reconcile the OpenSpec baseline

- [x] 1.1 Archive `path-scoped-middleware-lifecycle-hooks` after merging its deltas without dropping newer manifest scenarios.
- [x] 1.2 Archive `composable-standard-providers` after refreshing overlapping middleware, generator, runtime, deployment, and model scenarios.
- [x] 1.3 Archive `redesign-domain-service` and sync its domain-first requirements.
- [x] 1.4 Archive `replace-on-event-with-event-functions` and sync exact event-function requirements.
- [x] 1.5 Run strict validation after every archive and confirm no predecessor change remains active.

## 2. Establish workspace and package boundaries

- [x] 2.1 Add the provider protocol and generic local-service package shells with package manifests, project references, pure entry barrels, and focused package tests.
- [x] 2.2 Register `integrations/catalog` and `integrations/packages/*` in root workspaces, TypeScript references, Turbo tasks, boundary tooling, and packed-package scripts.
- [x] 2.3 Add standalone package shells for Redis, S3, Docker, local services, Cloudflare, AI SDK, Sentry, OTLP, AWS, and Pulumi without pulling SDKs into authoring entrypoints.
- [x] 2.4 Enforce core → protocol, integration → core protocol, catalog → standalone integration, and generated app → selected standalone runtime dependency direction.
- [x] 2.5 Extend package export smoke tests and packing checks to cover authoring, runtime, local-recipe, host, infrastructure, and engine subpaths.
- [x] 2.6 Update repository topology guidance and automated package-structure checks while preserving the 200-line implementation limit and existing Konsistent wildcard rules.
- [x] 2.7 Add changesets and release classifications for removed provider packages/exports and every new independently publishable integration package.
- [x] 2.8 Run project-reference, boundary, Konsistent validate/audit, package export, and packed-package checks for the empty package cohort.

## 3. Implement the provider protocol and `defineApp`

- [x] 3.1 Implement immutable branded capability, adapter, connection-contract, behavior, feature, access, integration-reference, and normalized binding types.
- [x] 3.2 Implement named binding-value references and keep their type/brand distinct from `defineEnv` fields and handler-visible `ctx.env` values.
- [x] 3.3 Implement connected, local-only, local-overlay, and infrastructure source normalization with duplicate/nested source rejection.
- [x] 3.4 Implement binding resolution precedence and conflict validation for local outputs, infrastructure outputs, named runtime values, fallbacks, and defaults.
- [x] 3.5 Implement direct binding and profile-map normalization, descriptor/default/sole-profile selection, and ambiguity diagnostics.
- [x] 3.6 Implement adapter feature declarations, logical requirement validation, and binding-level access metadata without adapter-option extraction.
- [x] 3.7 Implement `defineApp` with singular capability keys, environment, defaults, telemetry, server, Inspector, and deployment inputs using the shared normalizer.
- [x] 3.8 Remove `defineConfig`, `external`, `managed`, plural capability keys, `connect`, `connection`, `provision`, legacy provider defaults, and compatibility forwarding exports.
- [x] 3.9 Add type-level and unit coverage for inference, purity, immutability, profiles, duplicate sources, named-value isolation, configuration conflicts, features, and removed exports.
- [x] 3.10 Add public JSDoc for the new authoring primitives with executable examples, categories, and version metadata.

## 4. Build standalone integrations

- [x] 4.1 Move Redis authoring/runtime ownership into `@relkit/redis`, including configured/deferred forms, connection/behavior separation, features, provenance, and existing conformance tests.
- [x] 4.2 Move S3 authoring/runtime ownership into `@relkit/s3`, including configured/deferred forms, S3-compatible features, behavior fields, provenance, and bucket conformance tests.
- [x] 4.3 Implement `@relkit/local` generic planning/state contracts and `@relkit/docker` pure `docker()` authoring plus Docker materializer exports.
- [x] 4.4 Move Cloudflare KV/R2 and AI SDK model integrations into standalone packages with minimal authoring dependencies and selected runtime subpaths.
- [x] 4.5 Move Sentry and OTLP runtime ownership and SDK dependencies into their standalone packages without CLI-owned special imports.
- [x] 4.6 Refactor AWS into host/infrastructure/access exports and Pulumi into deployment-engine exports that consume only the generic deployment protocol.
- [x] 4.7 Implement the `@relkit/integrations` catalog as side-effect-free subpath re-exports and verify parity with concise standalone imports.
- [x] 4.8 Add minimal-install tests proving each standalone package loads and packs without unrelated integrations or SDKs.

## 5. Upgrade compiler and generated contracts

- [x] 5.1 Bump public contract and generator to 5, graph and manifest to 8, deployment plan to 3, and add version-1 provider, runtime-integration, local-service, and override contracts.
- [x] 5.2 Replace ownership/provider-set graph data with normalized source, profile, adapter, feature, access, named-value, local-recipe, integration, and deployment-role projections.
- [x] 5.3 Replace embedded manifest provider factories with application handlers plus a verified runtime-integration-plan reference.
- [x] 5.4 Generate deterministic runtime-integration plan v1 with stable selected package exports, versions, protocols, provenance, and graph-required ordering.
- [x] 5.5 Generate deterministic local-service plan v1 containing non-secret binding/recipe references and safe recipe configuration.
- [x] 5.6 Generate deployment plan v3 types for engine, host, connected bindings, infrastructure operations, and access operations.
- [x] 5.7 Implement package export/root validation, integration identity ownership, duplicate registration rejection, protocol checks, and deterministic static import generation.
- [x] 5.8 Implement the composite activation fingerprint and carry it through manifest metadata, generated runtime configuration, readiness, development supervisor, and Inspector generation records.
- [x] 5.9 Reject every previous contract/artifact version with precise rebuild or regeneration diagnostics and no compatibility reader.
- [x] 5.10 Update graph, manifest, plan, diagnostics, determinism, fixture, and stale-cohort tests and review all regenerated goldens.

## 6. Refactor runtime construction and testing

- [x] 6.1 Generate server imports only for selected runtime integration subpaths and remove unconditional standard/AWS provider factory imports.
- [x] 6.2 Implement runtime integration metadata verification before provider construction or traffic readiness.
- [x] 6.3 Implement binding-local value resolution without mutating process environment or handler-visible application environment state.
- [x] 6.4 Refactor the provider registry to construct only graph-required bindings once and preserve readiness, cancellation, safe health checks, draining, and reverse release.
- [x] 6.5 Remove every runtime branch that selects or replaces providers from `test`, `development`, `production`, or `RELKIT_ENV`.
- [x] 6.6 Add explicit capability/profile provider replacements to `createTestApplication` and the test runtime/fake APIs.
- [x] 6.7 Remove the engine dependency on local provider implementations and require integration tests to opt into Docker or configured real services explicitly.
- [x] 6.8 Apply provider profiles consistently to cache, bucket, job, event, and model requirements and preserve unrelated-binding failure isolation.
- [x] 6.9 Add runtime and testing coverage for unused bindings, missing replacements, duplicate profiles, lifecycle failure, concurrent applications, and secret-free diagnostics.

## 7. Implement local Docker services

- [x] 7.1 Implement deterministic local planning that runs during compile/check without probing Docker and starts no service.
- [x] 7.2 Implement Docker engine discovery, validated command execution, loopback random-port allocation, labeled container/volume inspection, and bounded health polling.
- [x] 7.3 Implement the pinned Redis recipe, persistent volume, `PING` health check, and binding-local Redis URL output.
- [x] 7.4 Implement the pinned MinIO recipe, generated local credentials, persistent data volume, protocol health check, and path-style S3 outputs.
- [x] 7.5 Implement canonical local project identity and labels for application, local project, binding, recipe, and plan hash.
- [x] 7.6 Implement project leases for attached sessions, detached adoption, live-owner refusal, dead-owner recovery, and worktree/clone isolation.
- [x] 7.7 Implement secure override state with restrictive permissions, canonical project paths, symlink/path-escape rejection, atomic writes, redacted output, and generation identity.
- [x] 7.8 Integrate required-only reconciliation with `DevSession`, reuse unchanged healthy services across candidates, and reconcile only affected bindings after plan changes.
- [x] 7.9 Implement `relkit local up/status/stop/reset`, attached and detached semantics, `dev --local=off`, live-lease protection, and confirmed project-scoped reset.
- [x] 7.10 Add unit tests for plans, labels, reconciliation, leases, secure state, CLI output, Docker absence, local-only release errors, and stale override activation.
- [x] 7.11 Add gated real Redis and MinIO integration tests for health, isolated profiles, persistence, adoption, cleanup, crash recovery, and no secret leakage.

## 8. Unify telemetry and Inspector

- [x] 8.1 Replace the observability provider binding and top-level Sentry path with typed telemetry capture, redaction, local retention, export sampling, and exporter configuration.
- [x] 8.2 Ensure canonical capture and redaction precede bounded Inspector persistence/live streaming and move root trace-consistent sampling after local persistence.
- [x] 8.3 Implement deterministic severity filtering, unsampled error/diagnostic defaults, exporter counters, and complete-unit overflow where possible.
- [x] 8.4 Implement static exporter loading and independent fan-out so one exporter cannot block application work or another exporter.
- [x] 8.5 Implement Sentry integration buffering/flush through its SDK and remove CLI-owned Sentry initialization, flush globals, and optional dependency.
- [x] 8.6 Implement one bounded OTLP queue, batching, retry/failure counters, overflow policy, and bounded shutdown.
- [x] 8.7 Emit exporter failures as redacted local-only diagnostics that cannot recursively re-enter the failed exporter.
- [x] 8.8 Remove CloudWatch from application provider/exporter configuration and route redacted structured stdout through AWS host logging.
- [x] 8.9 Extend Inspector API v1 additively with binding topology, integration provenance, local-service state, exporter health/sampling, counters, and activation fingerprint fields.
- [x] 8.10 Update Inspector views for provider profiles, local lifecycle, complete logs/traces, exporter state, and safe mismatch diagnostics using the existing accessible UI system.
- [x] 8.11 Add observability, exporter, Inspector API/UI, SSE, failure-isolation, sampling, redaction, and CloudWatch-routing regression coverage and run React diagnostics.

## 9. Refactor deployment and generator behavior

- [x] 9.1 Implement deployment plan v3 validation and deterministic diffing for engine, host, connected bindings, infrastructure operations, access operations, and runtime wiring.
- [x] 9.2 Refactor generic deployment orchestration to load the selected engine/host/infrastructure exports instead of hardcoding AWS behavior.
- [x] 9.3 Implement Pulumi engine plan/program materialization against generic deployment operations while retaining preview safety, confirmations, state, and cleanup behavior.
- [x] 9.4 Implement AWS ECS host output, CloudWatch stdout routing, and host-only infrastructure independently from application provider bindings.
- [x] 9.5 Implement `aws(adapter, options)` dispatch for supported S3 and Redis/Valkey infrastructure, authoritative connection outputs, feature validation, and least-privilege access operations.
- [x] 9.6 Prove connected bindings create no resource lifecycle or implicit access operations and removal changes runtime wiring only.
- [x] 9.7 Change generator defaults to cloud `none` and deploy `none`; add AWS/Pulumi only for explicit options and Docker only for selected capabilities that need it.
- [x] 9.8 Rewrite template application configuration and package inventories to `defineApp` and concise standalone integration imports.
- [x] 9.9 Add deployment plan, Pulumi mock, generated program, mixed-provider, connected-resource, CloudWatch routing, generator golden, and packed-project smoke tests.

## 10. Update examples, documentation, and landing

- [x] 10.1 Rewrite `examples/commerce` to demonstrate connected Redis/S3, Docker overlays, multiple cache servers, logical profile selection, explicit test replacements, Sentry plus OTLP, and mixed deployment ownership.
- [x] 10.2 Rewrite minimal, API, and agent templates plus their READMEs and tests without legacy APIs, implicit cloud defaults, or environment-based provider selection.
- [x] 10.3 Update the landing executable example data and existing landing components/copy to show `defineApp`, standalone/catalog imports, `docker(redis())`, `aws(s3())`, and Inspector telemetry without redesigning the component system.
- [x] 10.4 Update start, application, environment, provider, caching, storage, local-development, testing, observability, Inspector, deployment, CLI, and troubleshooting guides from executable canonical sources.
- [x] 10.5 Document direct connected, local-only, local-overlay, and infrastructure forms; profile selection; multiple cache servers; rate-limit key derivation; `--local=off`; and local-only release diagnostics.
- [x] 10.6 Document complete local Inspector telemetry before export sampling, concurrent Sentry/OTLP behavior, exporter failures, and CloudWatch host routing.
- [x] 10.7 Update guide/feature catalogs, repository contributor documentation, package public JSDoc, and CLI help metadata as the sources for generated navigation and references.
- [x] 10.8 Regenerate documentation outputs, review generated diffs, and scan all active examples, templates, docs, and landing content for removed provider symbols.
- [x] 10.9 Run focused example tests, documentation generation/tests, docs build, landing accessibility/responsive checks, and visual inspection of affected pages.

## 11. Verify and hand off the contract cohort

- [x] 11.1 Run provider protocol, type-level, compiler, graph, runtime, testing, local-service, telemetry, Inspector, deployment, generator, example, and documentation focused suites.
- [x] 11.2 Run Docker integration acceptance with `RELKIT_TEST_DOCKER=1` and record skipped status honestly when Docker is unavailable.
- [x] 11.3 Run package packing, export smoke tests, project references, boundaries, Konsistent validate/audit, JSDoc, changeset, and generated-artifact freshness checks.
- [x] 11.4 Run repository-wide scans proving removed APIs, environment-name provider branches, embedded provider factories, special Sentry code, and application CloudWatch exporters are absent.
- [x] 11.5 Run `bun run typecheck`, `bun run check`, applicable focused repository suites, `bun run build`, and `bun run verify` without enabling paid cloud tests.
- [x] 11.6 Verify every runtime/development/deployment path rejects stale or mismatched cohort artifacts before activation, traffic switch, or cloud mutation.
- [x] 11.7 Verify generated cloud-free and explicit AWS/Pulumi projects through install, check, test, build, and documented first-run workflows using packed artifacts.
- [x] 11.8 Record implementation evidence, intentionally skipped checks, known release constraints, and the separately authorized cloud acceptance still required for final release approval.
- [x] 11.9 Run strict OpenSpec validation and confirm every proposal capability has a coherent implemented delta and completed bounded task evidence.
