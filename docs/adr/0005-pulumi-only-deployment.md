# RELKIT-ADR-005: Pulumi-only deployment

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: RelKit maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

RelKit needs deployment plans that remain independent of cloud SDK and
infrastructure-engine types while supporting preview, update, refresh, output,
and destroy. Supporting multiple infrastructure engines would multiply state,
identity, security, and acceptance paths.

## Options

1. Support multiple infrastructure engines behind a common abstraction.
2. Build a RelKit-owned infrastructure state and provisioning engine.
3. Convert a provider-neutral plan to Pulumi and drive Pulumi through its
   Automation API and CLI/backend.

## Decision

Choose option 3. The canonical graph feeds a versioned provider-neutral plan;
`deploy-pulumi` generates or runs the Pulumi program. Pulumi is the only POC
deployment engine and state authority. RelKit will not add an alternate IaC
engine, parallel state store, Pulumi types to the plan, or executable cloud
callbacks to public contracts.

## Consequences

- Preview/up/refresh/outputs/destroy have one supported execution path.
- Plan tests can remain pure and provider-neutral.
- Pulumi CLI/backend and Automation API are required deployment dependencies.
- Pulumi-specific behavior is isolated to deployment-owned packages.

## Follow-up / actions

Future gates must prove no cloud mutation during preview, secret-safe Pulumi
events/reports, stable identities, explicit confirmation for risky changes,
and verified destroy/cleanup.

## References

- `docs/relkit-typescript-poc-technical-spec-v3.md` §§2.4, 6.3, 12, 22.
- `docs/relkit-typescript-poc-review-gates-v3.md` Gates 0, 15, and 16.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/workspace-foundation/spec.md` — Explicit POC scope guardrails.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/pulumi-aws-deployment/spec.md` — Provider-neutral plan and Pulumi-only deployment engine.
