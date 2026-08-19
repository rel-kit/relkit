# ZSYS-ADR-002: Internal Effect runtime

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: ZSys maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

ZSys needs managed scopes, cancellation, deadlines, structured failures,
logging, tracing, and deterministic time. These concerns must be consistent
across all invocation sources without making application code depend on the
chosen execution kernel.

## Options

1. Expose Effect as the application programming model.
2. Implement separate Promise-based mechanisms in each runtime path.
3. Keep Effect inside one managed runtime boundary and expose plain Promise
   and `AbortSignal` contracts publicly.

## Decision

Choose option 3. `runtime-effect` owns the internal Effect lifecycle and
services. The function engine adapts plain sync/async handlers into the active
Effect execution scope and preserves parent invocation, trace, deadline,
cancellation, logging, and resource lifetime. Public packages and generated
applications expose no Effect types or APIs.

## Consequences

- Runtime behavior has one lifecycle and failure normalization boundary.
- Public authoring stays portable and framework-neutral.
- The internal bridge must preserve cancellation and parent context correctly.
- Effect remains an implementation dependency of owned internal packages.

## Follow-up / actions

Future gates must scan public declarations and generated applications for
Effect leakage, test interruption and release behavior, and route framework
logs through approved internal sinks.

## References

- `docs/zsys-typescript-poc-technical-spec-v3.md` §§2.3, 6.3–6.5, 8, 13.
- `docs/zsys-typescript-poc-review-gates-v3.md` Gates 0, 1, 4, 5, and 16.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/public-authoring/spec.md` — Plain TypeScript public boundary.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/function-runtime/spec.md` — Internal Effect execution and context-preserving invocation.
