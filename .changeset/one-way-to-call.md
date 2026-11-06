---
"relkit": minor
"@relkit/app": minor
"@relkit/cli": minor
"@relkit/testing": minor
---

Breaking: Function descriptors no longer have `invoke()`, channel descriptors no longer have `trigger()` or `getPresence()`, and `defineFunction`, `defineTask` and `defineEventFunction` no longer accept `publishes`. Declare what a handler calls under `dependencies` and reach it through its context: `ctx.functions.priceOrder(input)`, `ctx.events.orderCreated.publish(payload)` and `ctx.channels.orderUpdates.trigger(params, event, payload)`. Code outside handlers, such as raw routes and middleware, uses `getRelkit()`, and tests call functions with `invokeFunction` from `@relkit/testing`. `bindFunctionEvents` takes only the consumed event, the `events` option of `@relkit/testing` event runtimes is gone, and the `RELKIT_EVENT_PUBLICATION_UNKNOWN` and `RELKIT_EVENT_PUBLICATION_DUPLICATE` checks no longer exist. Tool descriptors and graph nodes keep `invoke()`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#context-calls).
