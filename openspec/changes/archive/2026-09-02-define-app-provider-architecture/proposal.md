## Why

RelKit's current application configuration couples provider selection to environment branches, embeds executable factories in runtime artifacts, conflates protocol adapters with resource ownership, and silently substitutes test providers. This makes local development, mixed-vendor deployment, integration packaging, telemetry, and testing harder to understand and prevents the public API from expressing one stable application topology.

## What Changes

- **BREAKING** Replace `defineConfig` with `defineApp`, singular provider capability keys, direct bindings, profile maps, and explicit profile defaults.
- **BREAKING** Remove `external`, `managed`, environment-specific provider recipes, implicit test replacement, plural provider keys, embedded runtime factories, and the special Sentry and CloudWatch provider paths without compatibility aliases or migration tooling.
- Introduce pure adapter and binding contracts for connected services, local-only Docker services, and infrastructure-owned resources, with binding-local connection references distinct from handler-visible application environment values.
- Add `docker(adapter)` for local services and infrastructure wrappers such as `aws(adapter, options)` that provision release resources while selecting compatible local recipes automatically.
- Add independently installable integration packages, concise `@relkit/<integration>` imports, a side-effect-free `@relkit/integrations` catalog, and deterministic static runtime integration loading.
- Add versioned runtime-integration and local-service plans, deployment plan v3, and a composite activation fingerprint spanning the complete generated cohort.
- Replace environment-based test behavior with explicit provider replacements owned by `@relkit/testing`.
- Route redacted telemetry to bounded Inspector persistence before optional trace-consistent Sentry and OTLP export; treat CloudWatch Logs as AWS host routing rather than an in-process exporter.
- Separate deployment engine, host, infrastructure, access, and connected-binding responsibilities, and make generated projects cloud-free and deploy-free by default.
- Update canonical examples, templates, guides, generated API/CLI reference inputs, Inspector surfaces, and the landing page to present the new local-to-cloud integration workflow.

## Capabilities

### New Capabilities

- `provider-bindings`: Adapter descriptors, binding sources, profiles, connection contracts, infrastructure outputs, features, access metadata, integration identities, explicit test replacements, and validation.
- `local-provider-services`: Docker plans and recipes, reconciliation, health, secure binding outputs, persistence, locks and leases, development-session reuse, and local lifecycle commands.

### Modified Capabilities

- `public-authoring`: Make `defineApp` and the singular provider topology the only application configuration contract.
- `managed-resources`: Retain cache and bucket behavior while consuming provider bindings and profile features rather than owning provider selection.
- `compiler-graph`: Replace embedded factories with versioned integration/local plans and a verified activation cohort.
- `function-runtime`: Resolve binding-local values and selected integration modules without environment-name branches or implicit test providers.
- `jobs-events`: Select job and event runtimes through the common binding protocol and deployment ownership model.
- `tools-agents`: Select model integrations through the same profile and static integration contracts.
- `observability`: Persist complete redacted Inspector telemetry before independent external export sampling and fan-out.
- `pulumi-aws-deployment`: Separate engine, host, infrastructure, access, and connected-binding behavior in deployment plan v3.
- `cli-scaffolding`: Generate cloud-free projects by default and add local-service planning and lifecycle commands.
- `development-inspector`: Expose binding sources, profiles, local-service state, exporter health, diagnostics, and activation identities without secrets.
- `developer-documentation`: Replace the old provider workflow across guides, references, examples, and the public landing page.
- `workspace-foundation`: Register the integrations workspace and permit trusted statically referenced integration modules while retaining plugin-marketplace guardrails.
- `acceptance-verification`: Verify the complete contract cohort, integration boundaries, Docker isolation, telemetry behavior, generated projects, documentation, and release-gated cloud evidence.

## Impact

The change affects application authoring, provider and testing packages, compiler artifacts, the engine and development supervisor, CLI generation and local commands, Inspector APIs, observability, Pulumi/AWS deployment, examples, templates, documentation, workspace boundaries, package publishing, and release verification. Public contracts move to version 5, graph and manifest to version 8, deployment plans to version 3, and the new provider, runtime-integration, local-service, and override formats start at version 1; previous artifacts require regeneration.
