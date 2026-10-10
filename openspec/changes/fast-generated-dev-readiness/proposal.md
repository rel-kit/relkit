## Why

Generated projects currently spend seconds checking and preparing development before serving their first backend response. A prepared project should start in less than 500 ms on the reference host while retaining validation, activation safety, and last-known-good behavior.

## What Changes

- Prepare a versioned, relocatable development snapshot during installed project creation, reusing its successful check. Document preparation after installation for `--no-install` projects.
- Validate snapshot identity and contents through a small Bun startup path, execute its entrypoint directly, verify an actual backend route, and activate through the existing supervisor. Remove duplicate checking and development bundling from unchanged starts.
- Load nonessential route implementations on demand without weakening complete graph validation, middleware, provider readiness, or activation checks.
- Start inspector and persistent telemetry outside backend readiness, using bounded, redacted early-event retention with explicit overflow diagnostics.
- Keep orchestration in Effect services with a Bun runtime adapter and a future Deno adapter boundary. Preserve explicit checking and production build/start behavior; retain pinned Bun rather than depending on a new type checker.
- Gate every valid runtime-affecting creation combination using packed packages: 20 controlled starts each, every real backend response strictly below 500 ms. Include fresh installed starts and unchanged restarts; time the fullstack API separately from its web page and Docker provisioning separately from healthy-service restarts.
- **BREAKING**: hide creation combinations without passing readiness evidence from interactive choices and reject their explicit flags. Failure of the default combination blocks shipment.

## Capabilities

### New Capabilities

None; extend the existing contracts.

### Modified Capabilities

- `cli-scaffolding`: prepared atomic creation, post-install preparation, consistent creation capability gating, and accurate backend/inspector startup output.
- `compiler-graph`: portable validated snapshots, complete input identity, artifact integrity, and atomic publication.
- `development-inspector`: verified fast activation, safe fallback, concurrent support services, and owned cancellation/shutdown.
- `http-runtime`: validated lazy route execution and serving proof tied to the active graph.
- `observability`: bounded early records, asynchronous persistence handoff, explicit loss, and isolated delayed support startup.
- `acceptance-verification`: reproducible baseline, packed timing matrix, strict per-run gate, failure coverage, and implementation verification.

## Impact

Affected areas include `packages/create-relkit`, `packages/cli`, `packages/compiler`, HTTP/runtime registration, telemetry persistence, generated templates including fullstack/jobs, generator acceptance and performance scripts, and onboarding/reference documentation. Development snapshots are local disposable artifacts, independent of production build outputs and user-owned runtime state.

The promise covers newly generated installed projects and unchanged restarts on the current Apple M1 Pro/macOS arm64 host with pinned Bun. Source edits, installation, Docker provisioning, and the fullstack web page are measured separately. Cloud acceptance remains separately authorized. The roughly seven-second observation is context, not a per-stage profile or a certified baseline; implementation starts with repeatable measurements. Every implementation source edit must follow `$use-effect`, including version-matched source research, service/test Layers, scoped lifetimes, and behavioral verification.
