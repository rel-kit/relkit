# Design

## Context

See proposal.md. Both shared Linux ARM and shared Apple Silicon failed timing with complete correct responses. No dedicated runner is registered. Measurement already has a 30-second terminal deadline, exact response matching, sequential starts, and scoped process cleanup.

## Goals / Non-Goals

**Goals:** Make release admission deterministic with respect to shared-host timing noise while preserving genuine functional failures and transparent performance results.

**Non-Goals:** Universal sub-second guarantees, paid runners, startup micro-optimizations, dropping samples, retries that replace failed samples, or expanding the supported tuple table.

## Decisions

- Keep the benchmark's default strict version-1 certification unchanged. Add explicit `--readiness-only` reports with version 2 and mode `candidate-readiness`. These retain the strict `summary` unchanged and add a `readiness` verdict with the existing 30-second deadline. This avoids misrepresenting slow reports as performance passes or relabeling old evidence.
- Make versioning use functional readiness by default. `certify-create.ts --performance` continues strict certification. Validators accept historical strict reports or explicit version-2 readiness reports and independently inspect every sample rather than trusting summary flags.
- Use free Ubuntu for functional versioning and optional release-branch repair. Provide a separate read-only manual Apple Silicon performance workflow that fails on slow samples and uploads passing or failing evidence. Emit a workflow warning when release performance misses the target.
- Share the pure report validator with repository evidence tests. Package evidence tests independently assert the same admission distinction within their package boundary. Keep the exact-identity table and transaction rollback intact.

## Risks / Trade-offs

- Shared runners cannot certify reference-host latency reliably → preserve actual host and timings; separate workflow success from release success and keep strict mode available locally.
- A performance regression can ship with valid functionality → emit a visible warning and retain all timing failures; make no new latency guarantee.
- Old report consumers could read a functional pass as a performance pass → use a new version and mode, preserve strict summary semantics, and reject unknown formats.

## Migration Plan

Keep all version-1 historical reports untouched. The next versioning run creates fresh version-2 evidence for the actual candidate. Review and merge the fix, observe CI and release versioning, and verify publication and a registry consumer separately. Rollback restores the prior gate code without rewriting historical evidence.
