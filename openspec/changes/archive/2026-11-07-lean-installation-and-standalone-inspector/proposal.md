# OpenSpec: Lean Installation and Standalone Inspector

## Why

A default RELKIT backend currently inherits optional SDKs, frontend dependencies, and inspector history storage through framework, CLI, creator, client, testing, and catalog dependency paths. Lazy JavaScript imports alone do not reduce installation or declaration requirements. Production startup also depends on lifecycle machinery owned by development tooling.

Separate application requirements from optional integrations and inspection while preserving ordinary TypeScript authoring, Effect execution, existing runtime semantics, and the current inspector UI. Deliver this as two independently verified stages: lean ownership first, standalone inspection second.

This change contains planning artifacts only. It preserves the supplied S1.1–S1.10 and S2.1–S2.8 obligations; implementation tasks remain unchecked. The original audit used `7df7608ceabfc0765cb3aa2706823e6955bc782f`; the subsequent repository review used `34dce6525b8b2b54fd7ca42842917706c442023a`. Those are distinct evidence sources, not implementation results.

## What Changes

- Establish measured, external packed-consumer baselines and independently enforce installation, evaluated JavaScript, consumed declarations, and production-artifact boundaries.
- Extend existing integration metadata with capability/phase-specific dependency requirements, tested optional-peer ranges, consumer-context resolution, and actionable pre-readiness failures without implicit installation.
- **BREAKING**: Move SDK-native agent execution and helpers to explicit `@relkit/langchain`; make MCP, AG-UI, Scalar, frontend bindings, auth/database drivers, and deployment implementations selected requirements. Preserve existing plain function/route/service authoring and selected-feature behavior.
- **BREAKING**: Make the integration catalog metadata-only; remove executable umbrella re-exports. Separate compiler-backed add/edit tooling from lightweight creation and wrapper bootstrap.
- Move production lifecycle ownership below the CLI and document compiled JavaScript startup with complete selected native/worker/asset closure.
- Separate lightweight observability from `@relkit/observability-local` persistence. Stage 1 permits only measured, enumerated CLI legacy-inspector paths; Stage 2 removes every exception.
- **BREAKING**: Inspection defaults off. Enabling a development bridge, installing `@relkit/inspector`, and running `relkit-inspector` become independent actions. Replace `inspector.port` with bridge `connection.host`/`connection.port`; UI port belongs to the tool.
- Rename the private UI workspace to `@relkit/inspector-ui`, move its packaged assets out of the CLI, and deliver the existing UI, collector, and store through standalone local and Docker distributions.
- Specify session ownership, authenticated private discovery, atomic hot-reload switching, durable replay acknowledgements, bounded queues, history preservation, failure isolation, and production exclusion. Core readiness, client identity, jobs, realtime, and RPC remain independent.
- Require `$use-effect` guidance and per-file review for all future authored code changes, plus affected documentation, templates, skills, release producers, and focused/native/browser/container evidence.

## Capabilities

### New Capabilities

None. Reuse existing capability boundaries rather than introducing a duplicate dependency-isolation capability.

### Modified Capabilities

- `workspace-foundation`: dependency policy, metadata-only catalog, package ownership, producer and quality participation.
- `provider-bindings`: selected requirements, compatibility diagnostics, consumer resolution, preserved integration identity.
- `compiler-graph`: static dependency discovery, selected plans, preparation invalidation.
- `public-authoring`: lightweight authoring and explicit inspector configuration.
- `tools-agents`: explicit SDK execution ownership and conditional native capabilities.
- `http-runtime`: optional transports/UI and independently available core endpoints.
- `typed-agent-client`: optional frontend bindings and declaration isolation.
- `cli-scaffolding`: creator/wrapper/tooling separation, selected dependencies, production startup, independent inspection.
- `pulumi-aws-deployment`: selected deployment ownership and production artifact closure.
- `observability`: storage ownership, bounded collection, durable acknowledgement/replay and privacy.
- `development-inspector`: standalone distribution, bridge, discovery, sessions, history and Docker.
- `developer-documentation`: executable dependency and inspection guidance.
- `acceptance-verification`: external consumers, stage gates, measurements and regression matrix.

## Impact

Implementation will affect authoring/contracts, compiler/provider discovery, engine and HTTP runtimes, clients/testing/auth/database packages, CLI/creator/wrapper, standalone integrations/catalog, inspector source/packaging, templates/examples, generated reference producers, and release classification. Exact current owners, proposed destinations, consumed/produced interfaces, tests, and commands are in `design.md` and `tasks.md`.

Keep Effect, Hono, essential oRPC, necessary Effect platform adapters, and compiler/editor TypeScript. Preserve data, migrations, diagnostic history, durable state, the Drizzle patch, dirty work, explicitly selected frontend functionality, and the active release-readiness change's functional-versus-performance distinction. No new workflows, generic entity-discriminator endpoints, implicit downloads, automatic Git operations, publication, destructive cleanup, or cloud spend are authorized. Planning writes are confined to this change directory.
