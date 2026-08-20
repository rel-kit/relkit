# @zsys/events

Events are versioned contracts. A listener is one typed callback; the compiler
lowers it to the same function engine and durable trigger used by every runtime.

```ts
import { defineEvent, onEvent } from "@zsys/events";
import { z } from "@zsys/schema";
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

`zsys create`, `zsys check`, and `zsys dev` generate
`.zsys/generated/event-registry.d.ts`, which supplies event-name autocomplete,
payload types, versions, and selector unions. Delivery defaults to `durable`;
use `{ delivery: "ephemeral" }` explicitly for best-effort telemetry.

`events.anyOf("orders.created", "orders.updated")` and
`events.match("orders.*")` pass a discriminated envelope to the callback.
`events.all({ payload: "unknown", purpose: "telemetry" })` remains the explicit
escape hatch for unrestricted listeners. Durable retry, redrive, and
dead-letter behavior belongs to the selected provider.
