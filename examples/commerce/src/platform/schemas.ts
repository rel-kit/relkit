import { z } from "@relkit/app/schema";

export const orderInput = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  customerEmail: z.string().email(),
});

export const orderCreatedPayload = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  customerEmail: z.string().email(),
  totalCents: z.number().int().nonnegative(),
});

export const orderUpdatedPayload = z.object({
  orderId: z.string().min(1),
  state: z.string().min(1),
});

export const orderCancelledPayload = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1),
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

const uploadedFile = z.file({
  maxBytes: 1024 * 1024 * 10,
  mediaTypes: ["image/jpeg", "image/png"],
});
export const assetUploadInput = z.object({
  label: z.string().min(1),
  primary: uploadedFile,
  attachments: z.array(uploadedFile),
});
export const assetUploadOutput = z.object({
  label: z.string(),
  files: z.array(z.string()),
});

export const receiptInput = z.object({
  orderId: z.string(),
  receiptKey: z.string(),
});

export const receiptOutput = z.object({ receiptId: z.string() });

export const orderCreatedEnvelope = z.object({
  instanceId: z.string(),
  eventId: z.string(),
  version: z.number().int().positive(),
  payload: orderCreatedPayload,
  occurredAt: z.string(),
  publishedAt: z.string(),
  traceId: z.string(),
  attributes: z.object({}),
});

const eventEnvelopeFields = {
  instanceId: z.string(),
  occurredAt: z.string(),
  publishedAt: z.string(),
  key: z.string().optional(),
  correlationId: z.string().optional(),
  causationInvocationId: z.string().optional(),
  traceId: z.string(),
  attributes: z.object({}),
};

export const orderChangeEnvelope = z.union([
  z.object({
    ...eventEnvelopeFields,
    eventId: z.literal("orders.created"),
    version: z.literal(1),
    payload: orderCreatedPayload,
  }),
  z.object({
    ...eventEnvelopeFields,
    eventId: z.literal("orders.updated"),
    version: z.literal(1),
    payload: orderUpdatedPayload,
  }),
  z.object({
    ...eventEnvelopeFields,
    eventId: z.literal("orders.cancelled"),
    version: z.literal(1),
    payload: orderCancelledPayload,
  }),
]);

const telemetryPayload = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.object({}),
]);

export const telemetryEnvelope = z.object({
  ...eventEnvelopeFields,
  eventId: z.string(),
  version: z.number().int().positive(),
  payload: telemetryPayload,
});

export const authorizationInput = z.object({ authorization: z.string() });
export const authorizationOutput = z.object({ allowed: z.boolean() });

export const supportInput = z.object({ question: z.string().min(1) });
export const supportOutput = z.object({ answer: z.string() });

export const priceKey = z.object({ sku: z.string() });
export const priceValue = z.number().int().nonnegative();
