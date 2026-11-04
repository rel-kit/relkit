import { defineFunction, defineService } from "relkit";
import { z } from "relkit/schema";

const getOrder = defineFunction({
  id: "orders.get",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

const orderService = defineService({
  id: "orders",
  functions: { getOrder },
});

const caller = defineFunction({
  id: "orders.caller",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  dependencies: { functions: { getOrder: orderService.getOrder } },
  handler: async ({ id }, context) => {
    const input: Parameters<typeof context.functions.getOrder>[0] = { id };
    const output: Promise<{ readonly ok: boolean }> = context.functions.getOrder(input);
    return output;
  },
});
const originalHandler: typeof getOrder.handler = orderService.getOrder.handler;
const originalMember: typeof getOrder = orderService.getOrder;

defineService({ id: "empty", functions: {} });

void caller;
void originalHandler;
void originalMember;
