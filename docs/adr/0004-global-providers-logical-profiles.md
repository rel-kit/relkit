# RELKIT-ADR-004: Global providers and logical profiles

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: RelKit maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

Resource and trigger descriptors need portable behavior without embedding
vendor clients, credentials, or lifecycle ownership. Provider construction and
readiness also need one consistent scope per runtime generation.

## Options

1. Construct a provider per resource or trigger descriptor.
2. Put vendor details directly on each public descriptor.
3. Select one environment-scoped provider set and reference logical profiles.

## Decision

Choose option 3. The application selects concrete capability providers once per
environment. Resources and triggers reference logical profiles such as
`default` or `archive`; descriptor evaluation remains value-free. Graph output
contains only safe logical capability/profile metadata and variable references.
Factories resolve validated values and own clients only during generation
startup, with one provider instance per required capability in generation scope.

## Consequences

- Application descriptors stay portable across local, test, and AWS providers.
- Provider readiness and release are centralized.
- Missing profiles fail readiness before activation.
- Provider profile configuration and capability reporting become part of the
  graph/runtime contract.

## Follow-up / actions

Future gates must test profile resolution, secret-safe graph projection,
generation-scoped lifecycle, capability failures, and bucket/cache conformance.

## References

- `docs/relkit-typescript-poc-technical-spec-v3.md` §§3.5, 9, 10, 17.
- `docs/relkit-typescript-poc-review-gates-v3.md` Gates 1, 2, 7, 15, and 16.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/public-authoring/spec.md` — Global logical provider configuration.
- `openspec/changes/implement-relkit-typescript-poc-v3/specs/managed-resources/spec.md` — Environment-scoped global providers and provider lifecycle.
