import { z } from "@relkit/app/schema";

export const orderInput = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  customerEmail: z.string().email(),
});

export const createOrderOutput = z.object({
  orderId: z.string(),
  receiptKey: z.string(),
  totalCents: z.number().int().nonnegative(),
});

export const orderLookupInput = z.object({ orderId: z.string().min(1) });

export const orderLookupOutput = z.object({
  orderId: z.string(),
  status: z.string(),
  totalCents: z.number().int().nonnegative(),
});

export const orderMutationInput = z.object({
  orderId: z.string().min(1),
  state: z.string().min(1),
});
export const orderDeleteInput = z.object({
  orderId: z.string().min(1),
  reason: z.string().optional(),
});
export const orderDeleteOutput = z.object({ orderId: z.string(), deleted: z.boolean() });
export const orderSearchInput = z.object({ status: z.string().optional() });
export const orderSearchOutput = z.object({ status: z.string(), count: z.number().int() });

export const pathInput = z.object({ parts: z.array(z.string()).optional() });
export const pathOutput = z.object({ path: z.string() });

// #region receipt-schemas
export const receiptInput = z.object({
  orderId: z.string(),
  receiptKey: z.string(),
});

export const receiptOutput = z.object({ receiptId: z.string() });
// #endregion receipt-schemas

export const authorizationInput = z.object({ authorization: z.string() });
export const authorizationOutput = z.object({ allowed: z.boolean() });

export const supportInput = z.object({ question: z.string().min(1) });
export const supportOutput = z.object({ answer: z.string() });
