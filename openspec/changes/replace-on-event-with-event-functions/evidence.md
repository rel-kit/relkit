# Event Functions Verification

Date: 2026-08-30

## Delivered contracts

- Contract-only `defineEvent({ id, input, version? })`, with version defaulting to `1`.
- Callable `defineFunction` and authored, event-only `defineEventFunction`, constructed by the shared internal descriptor factory.
- Registry-driven `publishes` permissions and exact-ID publisher clients; no automatic permission to republish the consumed event.
- One authored consumer function and one deterministic exact-event trigger, with no hidden function, selector expansion, or duplicate consumer edge.
- Delivery/replay admission, void-success enforcement, declared errors, Effect results, schema validation, independent fan-out/retry/dead-letter behavior, and structured trigger context.
- Updated Inspector, local/AWS providers, deployment/IAM projections, templates, commerce examples, documentation, and generated contracts.

Public descriptor contract and generator versions are `4`; graph and manifest versions are `7`. Old source and artifacts have no compatibility adapters or migration path in this change.

## Verification

- `bun run typecheck`: passed, including an activatable commerce graph with no diagnostics.
- `bun run check`: passed.
- `bun run test:all`: passed, including local container lifecycle, security, deployment mocks, generator/examples/docs, and all 10 browser tests.
- `bun run build`: passed.
- `bun test tests/phase0.test.ts`: 23 passed.
- Strict OpenSpec validation: passed.
- Public declaration and packed-export smoke checks: passed.
- Packed release readiness: passed for all 36 packages and all three templates, including generated-project tests and reproducibility checks.
- `bun run verify`: passed in the fixed fail-fast order.

Focused regressions cover parsed registry input, void/declared-error/Effect handlers, exact publication capabilities, source-located diagnostics, forged targets, delivery/replay admission, follow-up and same-event publishing, asynchronous fan-out, exact graph edges, and EventBridge envelopes/failure responses.

The release-readiness smoke check found a generated API route fixture still using the former event alias and an HTTP test harness that did not resolve generated publication contracts. The fixture now uses the exact ID `orders.created`; the harness loads and validates the generated registry for direct and nested calls, including isolated package installs. Event binding preserves inferred function identities. Focused regressions and the final packed-template checks pass.

## Additional checks and limits

An additional package-local sweep (`bun test ./packages/events ./packages/functions ./packages/invocation ./packages/providers-local ./packages/engine`) reports 101 passed and two failures in `packages/engine/observability.test.ts`:

- `attaches service and member identity to invocation and spans`
- `observes calls between sibling service members with correlated records`

Both expect service attribution during direct invocation of service members. Both failures also reproduce on an isolated `git archive HEAD` copy (3 passed, 2 failed), using source aliases and the existing installed dependency versions. They predate this change and remain unresolved. The repository's required `test:all` and `verify` suites do not include these two package-local tests.

React Doctor reports a score of 83 with warnings and no errors. No broad Inspector refactor was added to address advisory findings.

Cloud acceptance was intentionally skipped: no live AWS resources were provisioned. AWS behavior was verified through mocked runtime tests, deployment plans, EventBridge/SQS projections, and IAM assertions.

Legacy API scans are clean across active event/function/compiler/runtime authoring surfaces, templates, examples, and user guides, except the regression asserting that `onEvent` is not exported. Historical POC specifications and ADR-003 are retained as historical records; ADR-008 supersedes their event-authoring decisions. Inspector stream callbacks named `onEvent` are unrelated to the removed business-event API.
