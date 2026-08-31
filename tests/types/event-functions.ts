import { Effect } from "effect";
import { defineEvent, defineEventFunction } from "@relkit/events";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";

export const created = defineEvent({
  id: "type_order_created",
  input: z.object({ orderId: z.string(), quantity: z.string().transform(Number) }),
});
export const receipt = defineEvent({
  id: "type_receipt_requested",
  input: z.object({ orderId: z.string() }),
});

declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly type_order_created: typeof created;
      readonly type_receipt_requested: typeof receipt;
    }
  }
}

defineFunction({
  id: "typed_publisher",
  input: z.unknown(),
  output: z.void(),
  publishes: ["type_order_created"],
  handler: async (_, context) => {
    await context.events.type_order_created.publish({ orderId: "1", quantity: "2" });
    // @ts-expect-error publication input is the schema input, not parsed output
    await context.events.type_order_created.publish({ orderId: "1", quantity: 2 });
    // @ts-expect-error undeclared event
    context.events.type_receipt_requested;
    return undefined;
  },
});

defineFunction({
  input: z.unknown(),
  output: z.void(),
  handler: (_, context) => {
    // @ts-expect-error empty publications expose no event clients
    context.events.type_order_created;
    return undefined;
  },
});

const consumer = defineEventFunction({
  id: "typed_consumer",
  event: "type_order_created",
  publishes: ["type_receipt_requested"],
  handler: async (input, context) => {
    const quantity: number = input.quantity;
    const eventId: "type_order_created" = context.trigger.event.id;
    const version: 1 = context.trigger.event.version;
    await context.events.type_receipt_requested.publish({ orderId: input.orderId });
    // @ts-expect-error consumed event is not automatically publishable
    context.events.type_order_created;
    void quantity;
    void eventId;
    void version;
  },
});
// @ts-expect-error event functions have no invocation API
consumer.invoke({});
// @ts-expect-error event functions have no tool conversion API
consumer.asTool();
// @ts-expect-error contracts have no publish API
created.publish({});
// @ts-expect-error contracts have no invocation API
created.invoke({});

defineEventFunction({
  id: "bad_input",
  event: "type_order_created",
  // @ts-expect-error event input comes from its contract
  input: z.unknown(),
  handler: () => {},
});
defineEventFunction({
  id: "bad_output",
  event: "type_order_created",
  // @ts-expect-error event functions only succeed with void
  output: z.void(),
  handler: () => {},
});
defineEventFunction({
  id: "bad_tool",
  event: "type_order_created",
  // @ts-expect-error event functions cannot become tools
  tool: {},
  handler: () => {},
});
defineEventFunction({
  id: "bad_trigger",
  event: "type_order_created",
  // @ts-expect-error event selection is flattened
  trigger: { event: "type_order_created" },
  handler: () => {},
});
// @ts-expect-error successful values must be void
defineEventFunction({ id: "bad_result", event: "type_order_created", handler: () => 42 });

const failed = defineError({
  id: "type_receipt_failed",
  data: z.object({ reason: z.string() }),
  message: ({ reason }) => reason,
  retry: "later",
});
defineEventFunction({
  id: "typed_error",
  event: "type_order_created",
  errors: [failed],
  handler: () => failed.create({ reason: "unavailable" }),
});
defineEventFunction({
  id: "typed_effect",
  event: "type_order_created",
  errors: [failed],
  handler: () => Effect.fail(failed.create({ reason: "unavailable" })),
});
defineEventFunction({
  id: "typed_effect_void",
  event: "type_order_created",
  handler: () => Effect.void,
});
// @ts-expect-error Effect success must also be void
defineEventFunction({
  id: "bad_effect",
  event: "type_order_created",
  handler: () => Effect.succeed(42),
});
