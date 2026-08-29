import { z } from "@relkit/schema";

export const emptyInput = z.object({});
export const orderInput = z.object({ orderId: z.string() });
export const orderOutput = z.object({ orderId: z.string(), ok: z.boolean() });
export const filesInput = z.object({ parts: z.array(z.string()) });
export const filesOutput = z.object({ count: z.number() });
export const authInput = z.object({ authorization: z.string() });
export const authOutput = z.object({ allowed: z.boolean() });
export const errorData = z.object({ orderId: z.string() });
