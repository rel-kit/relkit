import { z } from "@zsys/schema";

export const orderInput = z.object({ orderId: z.string(), sku: z.string() });
export const lookupInput = z.object({ orderId: z.string() });
export const orderOutput = z.object({ orderId: z.string(), totalCents: z.number() });
export const eventPayload = z.object({ orderId: z.string(), sku: z.string() });
export const eventEnvelope = z.object({
  eventId: z.string(),
  version: z.number(),
  payload: eventPayload,
});
export const receiptInput = z.object({ orderId: z.string() });
export const receiptOutput = z.object({ receiptId: z.string() });
export const authInput = z.object({ authorization: z.string() });
export const authOutput = z.object({ allowed: z.boolean() });
export const agentInput = z.object({ question: z.string() });
export const agentOutput = z.object({ answer: z.string() });
export const priceKey = z.object({ sku: z.string() });
export const priceValue = z.number();
