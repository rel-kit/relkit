# RELKIT-ADR-006: AWS-first target

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: RelKit maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

The POC requires one complete production deployment target to validate the
provider-neutral plan, runtime providers, identity stability, security, and
cleanup. Supporting several clouds before one target is complete would spread
the implementation and review surface without improving the baseline.

## Options

1. Implement several cloud targets in parallel.
2. Remain local-only for the POC.
3. Make AWS the first and only production cloud target for this baseline.

## Decision

Choose option 3. The initial production mapping is Bun/Hono on ECS/Fargate
behind ALB, with ECR, SQS/DLQ, EventBridge, S3, managed Valkey cache,
CloudWatch/optional OTLP, and the approved model-profile adapter. AWS-specific
runtime providers and Pulumi resources stay behind deployment/cloud package
boundaries; public descriptors remain cloud-neutral.

## Consequences

- Gate 15 can validate one end-to-end cloud path, including no-op update and
  cleanup.
- AWS capability gaps are explicit planning failures.
- Other clouds are out of POC scope and do not receive compatibility promises.
- AWS credentials and SDK types remain outside graph and public packages.

## Follow-up / actions

Future gates must test stable IDs across source moves, least-privilege mapping,
secret-safe configuration, isolated AWS smoke, no-op update, and independent
destroy verification.

## References

- `docs/relkit-typescript-poc-technical-spec-v3.md` §§2.1, 4.4, 6.3, 15.6, 22, 25.6.
- `docs/relkit-typescript-poc-review-gates-v3.md` Gates 15 and 16.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/pulumi-aws-deployment/spec.md` — Complete initial AWS mapping and deployment verification.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/workspace-foundation/spec.md` — Explicit POC scope guardrails.
