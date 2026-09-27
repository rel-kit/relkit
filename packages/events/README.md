# @relkit/events

Events are asynchronous facts. Publishing returns acceptance, not consumer results.
Each event function receives an independent delivery, with its own retry and dead-letter policy.

```ts
import { defineEvent, defineEventFunction } from "@relkit/app/events";
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export const orderCreated = defineEvent({
  id: "orders.created",
  input: z.object({ orderId: z.string() }),
});

export const createOrder = defineFunction({
  id: "orders.create",
  input: z.object({ orderId: z.string() }),
  output: z.object({ orderId: z.string() }),
  publishes: ["orders.created"],
  handler: async (input, context) => {
    await context.events["orders.created"].publish(input);
    return input;
  },
});

export const sendReceipt = defineEventFunction({
  id: "receipts.on-created",
  event: "orders.created",
  retry: { maxAttempts: 3 },
  handler: async ({ orderId }, context) => {
    context.log.info("Receipt requested", {
      orderId,
      instanceId: context.trigger.event.instanceId,
      attempt: context.trigger.delivery.attempt,
    });
  },
});
```

`relkit check` generates `EventRegistry` for exact event IDs, input types, and
versions. Event version defaults to `1`. Event functions require stable IDs;
delivery defaults to durable, profile to `default`, and retry to one immediate
attempt. Concurrency and timeout are unlimited unless supplied.

Only IDs in `publishes` appear in `context.events`. The consumed event is not
automatically publishable. Functions used by tools and jobs have the same
publication capabilities. Consumers may invoke ordinary functions, enqueue
jobs, and publish follow-up events.

Event contracts have no handler, output, or invocation method. Event functions
have no authored input/output, `.invoke()`, or `.asTool()`. Successful handlers
return void; declared errors and Effect error channels remain supported.

The graph contains the authored event-only function and one generated trigger
`relkit.event.<function-id>.trigger`, with exact event ID/version and delivery
policy. Inspector derives consumers through those trigger edges. Durable
delivery is at-least-once: make side effects idempotent before retry or replay.

## Effect operations

Import these operations from `@relkit/events/effect`. The application authoring
entry points continue to expose the synchronous factories and Promise client.

The authoring factories and validators expose `*Effect` variants. Their failures
use tagged `EventDefinitionError` or `EventBindingError` values. The established
synchronous APIs call these Effect operations and continue to throw `TypeError`
for invalid definitions.

Publishing through a supplied `EventPublisher` service is available with
`publishEventEffect(setup, payload)`. Use `eventPublisherLayer(provider)` for a
live provider, or supply a test Layer. `createEventClient` retains the Promise
API used by handlers; its payload validation error remains a `TypeError`.
The Effect path reports `EventPayloadValidationFailure` by tag.

Event operations emit bounded operation and failure counters, a duration
histogram, and spans. Supply `EventTelemetry` to inspect or replace the
observer. `EventIdentity` supplies the envelope clock and ID generator; its
default Layer uses the wall clock and random UUIDs.
