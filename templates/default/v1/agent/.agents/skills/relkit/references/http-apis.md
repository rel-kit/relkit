# HTTP routes and request policy

Routes live under `src/routes/**/route.ts`. The file path supplies the URL, and named exports supply methods. Import route APIs from `@relkit/app/routes`. Use a public service function as the target for ordinary application endpoints.

## `defineRoute`: one function-backed method

In `src/routes/hello/route.ts`, this exposes the service's public `hello` function as `GET /hello`:

```ts
import { defineRoute } from "@relkit/app/routes";
import hello from "@app/hello/service.js";

export const GET = defineRoute({ target: hello.hello });
```

A function-backed route can also set `successStatus`, `request`, `responses`, `rateLimit`, and `timeoutMs` when needed. The target must be a public callable function; jobs, events, agents, and tools are not route targets. Ordinary JSON request and response schemas are inferred from the target unless you supply explicit mapping.

## `defineRoute`: raw Web handler

Use `handler` instead of `target` for a standalone Web `Request`/`Response` handler:

```ts
import { defineRoute } from "@relkit/app/routes";

export const GET = defineRoute({
  handler: async () => Response.json({ ok: true }),
});
```

A raw handler has a generic OpenAPI response. The recognized Better Auth mount also uses a raw route:

```ts
import { defineRoute } from "@relkit/app/routes";
import auth from "@app/auth/service.js";

export const ALL = defineRoute({ handler: auth.handler });
```

## `defineServiceRoutes`: methods on one service

```ts
import { defineServiceRoutes } from "@relkit/app/routes";
import orders from "@app/orders/service.js";

export const { GET, POST } = defineServiceRoutes(orders, {
  GET: "listOrders",
  POST: { member: "createOrder", successStatus: 201 },
});
```

`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` are supported service-route exports. `ALL` is for raw handlers. Do not add a `path` or `method` option to `defineRoute`; the filesystem and export determine both. The CLI can scaffold either form through `add route --mode route` or `--mode service-route`. It will not overwrite an existing route file; edit it directly to add a method.

Use `request` mapping only when inference cannot express headers, cookies, names, or nesting; it replaces the inferred mapping. Use `responses` only when you need an explicit response contract. `defineMiddleware(path, handler)` is for HTTP policy, and `defineTransform({ schema })` is for request transforms:

```ts
import { defineMiddleware } from "@relkit/app/routes";

export default defineMiddleware("/orders/*", async (_context, next) => {
  await next();
});
```

```ts
import { defineTransform } from "@relkit/app/routes";
import { z } from "@relkit/app/schema";

export default defineTransform({ schema: z.string() });
```

Application authorization must be enforced in the relevant route or function logic. After changing a route, run `bun run check` and `bun run typecheck`, exercise the HTTP endpoint, and inspect `/_relkit/v1/api-reference` while `bun run dev` is running.
