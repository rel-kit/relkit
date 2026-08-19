# @zsys/routes

Routes describe transport metadata and target a function reference. Request
mapping is a serializable DSL; arbitrary mapping callbacks are not accepted.

```ts
import { defineMiddleware, defineRoute, defineTransform, http } from "@zsys/routes";
import { z } from "@zsys/schema";
import authorize from "./authorize.function";
import getOrder from "./get-order.function";

const orderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string().min(1),
});

const auth = defineMiddleware({
  id: "orders.auth",
  target: authorize,
  request: http.input({ token: http.header("authorization") }),
  decision: http.continue(),
});

export default defineRoute({
  id: "orders.get-route",
  method: "GET",
  path: "/orders/:orderId",
  target: getOrder,
  request: http.input({ orderId: http.transform(orderId, http.path("orderId")) }),
  middleware: [auth],
  responses: [http.success(200, getOrder.output)],
});
```
