# Functions, services, events, and errors

Generated projects map `@app/*` to `src/*`; keep the `.js` suffix on source imports. Use the installed package types when an exact signature matters, and run `bun run check` to validate the discovered graph.

## Choose a domain before choosing a folder

For work spanning business capabilities, map responsibility to services before adding artifacts. Record the rules/state each service owns, the operations/events it exposes, its dependencies, and who coordinates invariants that cross boundaries. Service names should describe those responsibilities, not merely repeat the application name.

For example, a commerce backend could use:

| Service         | Owns                                      | Public contract                      |
| --------------- | ----------------------------------------- | ------------------------------------ |
| `orders`        | Order lifecycle and accepted order totals | Place/cancel order, `orders.created` |
| `pricing`       | Price calculation and discount rules      | Calculate a quote                    |
| `notifications` | Notification delivery and deduplication   | React to an order event              |

This is an example, not a required taxonomy. Related entities such as cars and car models may belong to one fleet service. Split by distinct rules and lifecycles, not by table count. One coherent capability can remain one service. A shared database, auth service, or tenant identifier is infrastructure reuse, not a reason to collect all business operations under one service.

### Public collaboration

Each service selects its own operations; another service must not act as a barrel for its neighbor's internals:

```ts
// src/services/pricing/service.ts
import { defineService } from "@relkit/app/services";
import calculateQuote from "./functions/calculate-quote.function.js";

export default defineService({ functions: { calculateQuote } });
```

An orders function can call the public pricing contract. For a pure calculation that needs no provider state:

```ts
import pricing from "@app/services/pricing/service.js";

// Inside an orders function handler:
const quote = await pricing.calculateQuote.invoke({ sku, quantity });
// Apply the order's acceptance rules to the validated quote.
```

Use the installed declarations for the calculation's actual input/output. Do not import `pricing/functions/*`, call a foreign handler, or expose the same function as a member of two services. A route for orders targets the orders service; separate URLs alone do not establish domain boundaries.

For an asynchronous reaction, orders owns and exposes `orders.created`; a consumer under `src/services/notifications/functions/` uses `defineEventFunction({ id: "notifications.order-created", event: "orders.created", ... })`. Event-only consumers are discovered in their owning domain and are not added to its callable functions map. The event examples below show publication and subscription.

### Invariants and transactions

Name one owner for a command's consistency rules. For example, accepting an order and reserving stock may require one atomic decision. A service call followed by a second write is not proof of an atomic transaction, and `.invoke()` must not be assumed to inherit the caller's transaction or resources.

Inspect installed transaction/invocation behavior before composing provider-backed commands. Choose a supported transaction coordinator or keep tightly coupled invariants within one cohesive owner. Define narrow public operations for other domains; do not duplicate another domain's rules or silently write its owned state from arbitrary helpers. Use events for reactions that can occur after commit, with an outbox when publication must survive a crash. Events alone do not preserve synchronous atomicity.

Keep one shared database service and its ordered migration history when the app uses one database. Do not create a database, auth service, or migration history per business domain.

Changing an existing operation's domain ownership is a redesign, not just a grouped/flat layout move. Review IDs, durable versions, policies, callers, and stored history explicitly; do not promise that a folder move between domains preserves identity.

### Review the resulting boundaries

Compare the actual service graph and routes with the ownership map. Check that each planned capability has real operations under its owner, imports use public service boundaries, business rules live with their owner, and no catch-all service still contains the implementation behind empty facades. Review any merged or split responsibility and verify cross-domain failure/rollback behavior. A passing graph check proves structural validity, not semantic cohesion.

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

An event-only consumer in `src/services/notifications/functions/` reacts without returning a result to its publisher:

```ts
import { defineEventFunction } from "@relkit/app/events";

export default defineEventFunction({
  id: "notifications.order-created",
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
