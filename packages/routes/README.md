# @relkit/routes

Routes describe transport metadata and target a function reference. Request
mapping is a serializable DSL; arbitrary mapping callbacks are not accepted.

For `src/routes/orders/[orderId]/route.ts`:

```ts
import { defineMiddleware, defineRoute, defineTransform, http } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";
import getOrder from "./get-order.function";

const orderId = defineTransform({
  id: "orders.normalize-id",
  schema: z.string().min(1),
});

export const auth = defineMiddleware("/orders/*", async (context, next) => {
  if (!context.req.header("authorization")) return context.json({ error: "unauthorized" }, 401);
  await next();
});

export const GET = defineRoute({
  id: "orders.get-route",
  target: getOrder,
  request: http.input({ orderId: http.transform(orderId, http.path("orderId")) }),
  responses: [http.success(200, getOrder.output)],
});
```

The compiler derives `GET /orders/:orderId` from the export and file path.
Route files may export any combination of `GET`, `POST`, `PUT`, `PATCH`,
`DELETE`, `HEAD`, and `OPTIONS`; helper exports are ignored. Use `[id]`,
`[...parts]`, and `[[...parts]]` directories for dynamic, required catch-all,
and optional catch-all segments.

Route IDs are optional and are inferred from the route method/path. Function and
service-member IDs may be inferred the same way; use explicit IDs when a source
move must preserve identity. `request` and `responses` are optional. Object
input fields matching path segments become reusable input and path parameters;
remaining fields become query parameters for read methods or a JSON body for write
methods. Explicit mappings and response arrays are complete overrides for
headers, cookies, transforms, multipart, redirects, and alternate media types.

Middleware is auto-discovered and registered with native Hono `app.use` in
canonical ID order. Supported paths are `*`, static segments, `:param`, and a
trailing `*`; route descriptors do not list middleware.

## Effect authoring

The synchronous `defineRoute`, `defineMiddleware`, `defineServiceRoutes`,
`defineTransform`, and `http` APIs are compatibility adapters. Their Effect
counterparts (`defineRouteEffect`, `defineMiddlewareEffect`,
`defineServiceRoutesEffect`, `defineTransformEffect`, and `httpEffects`) contain
the authoring logic and report invalid input as `RouteOperationError` in the
error channel. Synchronous calls preserve their TypeError messages.

For example, run `defineRouteEffect({ target: getOrder })` in an Effect runtime
to build a route from the `getOrder` function above.

Operations emit `routes.*` spans and bounded `relkit_route_*` metrics. Supply
`RouteTelemetry` in a Layer to replace the observer in tests. Omitted IDs use
the invocation package's `IdentityStore`, so a test Layer can provide a
deterministic ID source.
