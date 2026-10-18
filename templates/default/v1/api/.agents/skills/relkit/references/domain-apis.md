# Functions, services, events, and errors

Generated projects map `@app/*` to `src/*`; keep the `.js` suffix on source imports. Use the installed package types when an exact signature matters, and run `bun run check` to validate the discovered graph.

## `defineFunction` and `defineService`

Put domain behavior in `src/services/<domain>/functions/*.function.ts`. A function validates input before its handler and validates the returned output:

```ts
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const greet = defineFunction({
  id: "hello.greet",
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: `Hello, ${name}!` }),
});

export default greet;
```

Expose selected functions from `src/services/<domain>/service.ts`:

```ts
import { defineService } from "@relkit/app/services";
import greet from "@app/services/hello/functions/greet.function.js";

export default defineService({ functions: { greet } });
```

The service also accepts `events`, `tasks`, and `jobs` maps. Its members appear directly as `service.greet`; there is no `service.functions.greet` namespace. Membership makes a function available across domains, but does not create an HTTP route or grant authorization.

Each `service.ts` constructs and exports exactly one runtime service value. Keep ordinary helpers and error descriptors inside their owning domain; expose callable operations through the service's `functions` map. Do not re-export helpers or descriptors from a specialized database or auth `service.ts`.

Within a domain, import a sibling function directly. Across domains and from routes, import the other domain's `service.ts`. Invoke a function descriptor with `await service.greet.invoke(input)`; do not call its handler directly. Leave an internal function out of the service map. Tools, agents, caches, buckets, and event-only functions are not service members.

## `defineEvent` and `defineEventFunction`

Declare an event payload in `src/services/<domain>/events/*.event.ts`:

```ts
import { defineEvent } from "@relkit/app/events";
import { z } from "@relkit/app/schema";

const orderCreated = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ orderId: z.string() }),
});

declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "orders.created": typeof orderCreated;
    }
  }
}

export default orderCreated;
```

Expose it through `defineService({ events: { orderCreated } })` when other domains need it. A publisher declares the exact ID in `publishes: ["orders.created"]` and calls `await context.events["orders.created"].publish({ orderId })`.

An event-only consumer reacts without returning a result to its publisher:

```ts
import { defineEventFunction } from "@relkit/app/events";

export default defineEventFunction({
  id: "orders.confirmation",
  event: "orders.created",
  handler: async ({ orderId }, context) => {
    context.log.info("Order created", { orderId });
  },
});
```

## `defineError`

```ts
import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineError({
  id: "orders.not-found",
  data: z.object({ orderId: z.string() }),
  message: ({ orderId }) => `Order ${orderId} was not found`,
  http: { status: 404 },
  retry: { kind: "later", afterMs: 1_000 },
});
```

Declare only expected failures callers should handle on a function. Return each declared error through the public `fail` helper so it appears in the inferred handler result; throwing a declared error from an ordinary helper does not satisfy that contract. Use the route layer for HTTP-specific request mapping and middleware.

```ts
import { defineFunction, fail } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import AuthenticationRequired from "../errors/authentication-required.error.js";

export default defineFunction({
  input: z.object({}),
  output: z.object({ id: z.string() }),
  errors: [AuthenticationRequired],
  handler: async (_input, context) => {
    const session = await context.auth.getSession();
    if (session === null) return fail(AuthenticationRequired, {});
    return { id: session.user.id };
  },
});
```
