# ZSYS-ADR-003: Generic event triggers without a subscription primitive

- Status: Accepted — reviewed Phase 0 baseline
- Date: 2026-08-12
- Owner: ZSys maintainers
- Supersession: None; a future change must explicitly supersede this ADR.

## Context

Event delivery needs typed selectors, independent fan-out, and ephemeral or
durable delivery semantics. A separate application subscription resource would
duplicate trigger concepts and make graph, provider, and inspector terminology
diverge.

## Options

1. Add a public subscription descriptor and graph node.
2. Treat event listeners as provider-specific subscriptions.
3. Compile `onEvent` bindings into generic triggers targeting functions.

## Decision

Choose option 3. Public authoring uses `defineEvent`, selectors, and `onEvent`.
`onEvent` creates an immutable event-trigger descriptor with explicit delivery
and retry policy, targeting a function. Compilation expands known selectors to
explicit event ID/version pairs. Provider broker subscriptions, if needed,
are implementation details. ZSys exposes no `defineSubscription`, subscription
graph node, or `*.subscription.ts` convention.

## Consequences

- Event listeners share the function engine and generic trigger model.
- Selector expansion is deterministic and typed at compile time.
- Providers may choose different delivery mechanisms behind the boundary.
- Durable delivery must document at-least-once and duplicate behavior.

## Follow-up / actions

Future gates must verify independent fan-out, restart/retry semantics, explicit
event versions, and source/export/graph scans for the forbidden subscription
primitive.

## References

- `docs/zsys-typescript-poc-technical-spec-v3.md` §§2.5, 7.11–7.12, 16.
- `docs/zsys-typescript-poc-review-gates-v3.md` Gates 2, 3, 9, 13, and 16.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/public-authoring/spec.md` — Generic event trigger bindings.
- `openspec/changes/implement-zsys-typescript-poc-v3/specs/jobs-events/spec.md` — Event selectors, fan-out, delivery, and recovery.
