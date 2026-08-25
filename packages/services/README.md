# @zsys/services

Services group named function descriptors under one identity and ordered
invocation policy. They do not own another business handler or become a
workflow; member facades retain the original schemas, errors, and runtime
capabilities.

```ts
import { defineFunction, defineService, defineServiceMiddleware } from "@zsys/app";
import { z } from "@zsys/schema";

const getOrder = defineFunction({
  input: z.object({ orderId: z.string() }),
  output: z.object({ orderId: z.string() }),
  handler: async (input) => input,
});

const ordersContext = defineServiceMiddleware({
  handler: async (_invocation, next) => next({ domain: "orders" }),
});

export const Orders = defineService({
  functions: { getOrder },
  middleware: [ordersContext],
});

await Orders.getOrder.invoke({ orderId: "order-1" });
```

Service and member IDs may be inferred from source structure. Middleware runs
for HTTP, direct, job, event, tool, and agent member calls after input
validation and before the handler. Its frozen patch is visible only through
the invocation's read-only `context.service` value.
