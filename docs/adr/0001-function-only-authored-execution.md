# ZSYS-ADR-001: Function-only authored execution

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: ZSys maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

ZSys needs one executable abstraction that can be invoked directly, over HTTP,
by jobs, by events, and by tools. Giving each trigger its own handler model
would duplicate validation, lifecycle, error, and telemetry behavior.

## Options

1. Let routes, jobs, event listeners, and tools own handlers.
2. Make functions the only authored handler descriptors and let other
   descriptors reference functions.
3. Use registration callbacks as the primary public model.

## Decision

Choose option 2. Functions are the only authored descriptors that own user
handlers. Routes, middleware metadata, jobs, schedules, event triggers, and
tools target stable function references; agents compile to generated internal
function identities. Application code remains plain synchronous or
asynchronous TypeScript.

## Consequences

- Invocation validation, cancellation, errors, concurrency, and telemetry can
  share one engine.
- Trigger descriptors remain serializable and portable.
- Trigger-specific handler APIs are intentionally unavailable.
- The compiler and manifest must resolve every target function exactly once.

## Follow-up / actions

Future implementation and review gates must reject non-function handlers,
preserve stable function references, and prove every execution source enters
the common engine.

## References

- `docs/zsys-typescript-poc-technical-spec-v3.md` §§3.1, 7.5–7.16, 12, 13.
- `docs/zsys-typescript-poc-review-gates-v3.md` Gates 0, 2, 3, 5, and 16.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/public-authoring/spec.md` — Plain TypeScript public boundary and Function-only authored execution.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/function-runtime/spec.md` — One common function engine.
