# RELKIT-ADR-008: Authored event functions

- Status: Accepted
- Date: 2026-08-30
- Supersedes: ADR-003 authoring and selector decisions; preserves its generic trigger graph and independent pub/sub delivery model.

## Decision

Use contract-only `defineEvent({ id, input, version? })`, callable
`defineFunction`, and event-only `defineEventFunction({ id, event, handler })`.
Both function APIs declare exact publishing capabilities through `publishes`.
Event publication returns acceptance only; successful consumers return void.

Consumers remain authored function nodes. The compiler generates one exact-event
trigger per consumer, with independent retry, concurrency, timeout, acknowledgment,
dead-letter, and replay policy. No hidden executable consumer is generated.

Remove the previous callback and selector APIs without compatibility adapters or
state migration. Historical POC specifications record the former baseline; current
contracts are specified by `replace-on-event-with-event-functions` in OpenSpec.
