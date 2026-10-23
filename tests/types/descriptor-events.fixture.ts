/** Preserves single and discriminated event-envelope inference plus the original public event descriptor exports. */
import { defineEvent, type EventEnvelope } from "@relkit/events";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { output } from "./descriptor-schemas.fixture.js";
const createdPayload = z.object({ orderId: z.string() });

const changedPayload = z.object({ orderId: z.string(), state: z.string() });

export const eventCreated = defineEvent({
  id: "types.created",
  version: 1,
  input: createdPayload,
});

export const eventChanged = defineEvent({
  id: "types.changed",
  version: 2,
  input: changedPayload,
});

const createdEnvelope = z.object({
  instanceId: z.string(),
  eventId: z.literal("types.created"),
  version: z.literal(1),
  payload: createdPayload,
  occurredAt: z.string(),
  publishedAt: z.string(),
  traceId: z.string(),
  attributes: z.object({}),
});

const changedEnvelope = z.object({
  instanceId: z.string(),
  eventId: z.literal("types.changed"),
  version: z.literal(2),
  payload: changedPayload,
  occurredAt: z.string(),
  publishedAt: z.string(),
  traceId: z.string(),
  attributes: z.object({}),
});

const anyEnvelope = z.union([createdEnvelope, changedEnvelope]);

const singleEnvelopeTarget = defineFunction({
  id: "types.single-envelope",
  input: createdEnvelope,
  output,
  handler: async (value) => {
    const envelope: EventEnvelope<"types.created", 1, { orderId: string }> = value;
    const eventId: "types.created" = value.eventId;
    const version: 1 = value.version;
    void envelope;
    void eventId;
    void version;
    return { ok: true };
  },
});

const unionEnvelopeTarget = defineFunction({
  id: "types.union-envelope",
  input: anyEnvelope,
  output,
  handler: async (value) => {
    if (value.eventId === "types.created") {
      const version: 1 = value.version;
      const orderId: string = value.payload.orderId;
      void version;
      void orderId;
    } else {
      const version: 2 = value.version;
      const state: string = value.payload.state;
      void version;
      void state;
    }
    return { ok: true };
  },
});
