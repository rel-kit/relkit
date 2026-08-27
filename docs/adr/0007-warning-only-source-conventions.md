# RELKIT-ADR-007: Warning-only source conventions

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: RelKit maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

Recommended directories, suffixes, and export shapes help developers navigate a
project, but making them discovery requirements would make valid descriptors
depend on file layout. RelKit already has a stronger runtime-brand and semantic
validation model.

## Options

1. Require recommended paths, suffixes, and export shapes for discovery.
2. Ignore conventions entirely.
3. Discover by descriptor brand, report convention deviations as diagnostics,
   and keep them non-blocking by default.

## Decision

Choose option 3. Source conventions are advisory. Discovery continues for
valid branded descriptors outside recommended directories, suffixes, or export
shapes and emits structured informational or warning diagnostics. Convention
warnings do not cause a non-zero result or remove descriptors unless a separate
repository policy explicitly promotes warnings to errors.

## Consequences

- Refactors and unconventional but valid layouts remain supported.
- Diagnostics still provide guidance and a consistent project shape.
- Semantic errors remain blocking and are not downgraded.
- Review tooling must distinguish convention warnings from compile failures.

## Follow-up / actions

Future gates must include valid off-convention fixtures, assert descriptor
inclusion, and verify that warning-only paths do not block development, build,
test, or deployment by themselves.

## References

- `docs/relkit-typescript-poc-technical-spec-v3.md` §§5.2–5.4, 11.4–11.6, 25.1.
- `docs/relkit-typescript-poc-review-gates-v3.md` Gates 0, 2, 3, and 16.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/workspace-foundation/spec.md` — Structural conventions are evidence-based.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/public-authoring/spec.md` — Conventions warn without excluding descriptors.
