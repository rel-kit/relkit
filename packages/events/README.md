# @relkit/events

Events are versioned contracts. A listener is one typed callback; the compiler
lowers it to the same function engine and durable trigger used by every runtime.

```ts
import { defineEvent, onEvent } from "@relkit/events";
import { z } from "@relkit/schema";
export const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ orderId: z.string(), totalCents: z.number().int() }),
  sensitiveFields: ["customerEmail"],
});

export const sendReceipt = onEvent(
  "orders.created",
  async (payload, ctx) => {
    ctx.log.info("receipt.requested", {
      orderId: payload.orderId,
      instanceId: ctx.event.instanceId,
    });
  },
  { id: "orders.on-created" },
);
```

`relkit create`, `relkit check`, and `relkit dev` generate
`.relkit/generated/event-registry.d.ts`, which supplies event-name autocomplete,
payload types, versions, and selector unions. Delivery defaults to `durable`;
use `{ delivery: "ephemeral" }` explicitly for best-effort telemetry.

Listener IDs may be inferred from source bindings. Function calls inside a
listener use descriptor `invoke`; only jobs, events, buckets, cache, and agents
remain explicit managed dependencies.

`events.anyOf("orders.created", "orders.updated")` and
`events.match("orders.*")` pass a discriminated envelope to the callback.
`events.all({ payload: "unknown", purpose: "telemetry" })` remains the explicit
escape hatch for unrestricted listeners. Each matching listener receives its
own delivery: durable fan-out is at-least-once and independent, not a
transaction or simultaneous-execution guarantee. A failed listener cannot roll
back a successful sibling. Durable retry, redrive, and dead-letter behavior
belongs to the selected provider; declared `retry: { kind: "later", afterMs }`
errors provide a minimum delay hint.
