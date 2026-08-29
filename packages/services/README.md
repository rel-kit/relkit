# @relkit/services

Each domain exports one service descriptor that declares its public functions
and events. Members retain identity: the value on the service is the original
descriptor, not a wrapper or clone.

```ts
import { defineService } from "@relkit/app/services";
import createOrder from "./functions/create-order.function.js";
import orderCreated from "./events/order-created.event.js";

export default defineService({
  functions: { createOrder },
  events: { orderCreated },
});

await createOrder.invoke({ orderId: "order-1" });
```

Use ordinary imports for cross-domain dependencies. HTTP policy belongs under
`src/routes`, not on the service.
