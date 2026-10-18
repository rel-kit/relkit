import { z } from "@relkit/app/schema";

export const createOrderInput = z.object({
  sku: z.string().min(1).max(64).refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value),
    "Use letters, numbers, periods, underscores or hyphens for the SKU",
  ),
  quantity: z.number().int().min(1).max(100),
});

export const orderOutput = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().min(1),
});
