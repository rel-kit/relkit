---
"relkit": minor
"@relkit/cli": minor
"@relkit/drizzle": minor
"@relkit/testing": minor
---

Functions and tasks can declare `functions`, `events`, `channels` and `databases` under `dependencies`, next to `tasks`, `jobs`, `buckets`, `cache` and `agents`. Handlers reach each one as `ctx.functions.priceOrder(input)`, `ctx.events.orderCreated.publish(payload)`, `ctx.channels.orderUpdates.trigger(params, event, payload)` and `ctx.databases.<name>`, typed from the declared descriptor, and the application graph draws `calls-function`, `publishes-event`, `triggers-channel` and `uses-database` edges from these declarations. `relkit check` reports a `databases` entry that is not a Drizzle service. `ctx.database` still refers to the default database without a declaration.
