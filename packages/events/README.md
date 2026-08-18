# @zsys/events

Events are versioned contracts. `onEvent` creates a generic event trigger that
targets a function; it is not a separate application resource.

```ts
import { defineEvent, onEvent } from "@zsys/events";
import { z } from "@zsys/schema";
import handleOrder from "./handle-order.function";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  payload: z.object({ orderId: z.string(), totalCents: z.number().int() }),
  sensitiveFields: ["customerEmail"],
});

export default onEvent(orderCreated, {
  id: "orders.on-created",
  target: handleOrder,
  delivery: "durable",
  profile: "default",
});
```
