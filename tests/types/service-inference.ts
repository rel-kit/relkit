import { defineFunction, defineService } from "@zsys/app";
import { z } from "@zsys/schema";

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

const input: Parameters<typeof orderService.getOrder.invoke>[0] = { id: "1" };
const output: Promise<{ readonly ok: boolean }> = orderService.getOrder.invoke(input);
const serviceId: "orders" = orderService.getOrder.service.ref.id;
const originalHandler: typeof getOrder.handler = orderService.getOrder.handler;

// @ts-expect-error A service must declare at least one function.
defineService({ id: "empty", functions: {} });

void output;
void serviceId;
void originalHandler;
