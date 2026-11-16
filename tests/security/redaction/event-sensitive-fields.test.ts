/**
 * The fields an event lists in `sensitiveFields` carry the redaction marker wherever the payload
 * is recorded: the publisher's span (input and output) and the event function's span, on delivery
 * and on replay. The handler and the publisher's result keep the real payload.
 */
import { expect, test } from "bun:test";
import { defineEvent, defineEventFunction } from "relkit/events";
import { createObservabilityCollector } from "relkit/observability";
import { z } from "relkit/schema";
import { defineFunction } from "relkit/functions";
import { createTestEvent, invokeFunction } from "../../../packages/testing/src/index.ts";

const CARD = "4111-1111-1111-1111";
const EMAIL = "ada@example.test";
const payload = {
  orderId: "order-1",
  cardNumber: CARD,
  customer: { email: EMAIL, name: "Ada" },
};
const recorded = {
  orderId: "order-1",
  cardNumber: "[REDACTED]",
  customer: { email: "[REDACTED]", name: "Ada" },
};

const cardCharged = defineEvent({
  id: "payments.card-charged",
  input: z.object({
    orderId: z.string(),
    cardNumber: z.string(),
    customer: z.object({ email: z.string(), name: z.string() }),
  }),
  // A field name matches anywhere in the payload; a dotted path matches from its root.
  sensitiveFields: ["cardNumber", "customer.email"],
});

const completedSpans = (collector: ReturnType<typeof createObservabilityCollector>) =>
  collector.read().filter((record) => record.signal === "span" && record.status === "completed");

test("a delivery records the marker and the event function receives the values", async () => {
  const collector = createObservabilityCollector({
    redaction: { mode: "development-redacted", maxBytes: 8_192 },
  });
  const received: unknown[] = [];
  const event = await createTestEvent({
    event: cardCharged,
    target: defineEventFunction({
      id: "payments.on-card-charged",
      event: "payments.card-charged" as never,
      handler: async (input) => {
        received.push(input);
      },
    }),
    hooks: { observability: collector },
  });
  try {
    const result = await event.publish(payload);
    await event.drain();
    expect(result).toMatchObject({ payload });
    expect(received).toEqual([payload]);
  } finally {
    await event.close();
  }
  const delivery = completedSpans(collector).find(
    (span) => span.name === "relkit.invoke.payments.on-card-charged",
  );
  expect(delivery).toMatchObject({ inputCapture: { content: recorded } });
  // No record of any signal carries either value.
  const everything = JSON.stringify(collector.read());
  expect(everything).not.toContain(CARD);
  expect(everything).not.toContain(EMAIL);
});

test("a publication records the marker and the publisher receives the values", async () => {
  const collector = createObservabilityCollector({
    redaction: { mode: "development-redacted", maxBytes: 8_192 },
  });
  const charge = defineFunction({
    id: "payments.charge",
    input: z.object({ orderId: z.string() }),
    output: z.object({ published: z.string() }),
    dependencies: { events: { cardCharged } },
    handler: async (_input, context) => {
      const result = await context.events.cardCharged.publish(payload);
      // The publisher reads the real payload back from the result.
      return { published: result.payload.cardNumber };
    },
  });
  const output = await invokeFunction(
    charge,
    { orderId: "order-1" },
    { hooks: { observability: collector } },
  );
  expect(output).toEqual({ published: CARD });
  const publish = completedSpans(collector).find(
    (span) => span.name === "relkit.event.payments.card-charged.publish",
  );
  expect(publish).toMatchObject({
    inputCapture: { content: recorded },
    outputCapture: { content: { payload: recorded } },
  });
  const publication = JSON.stringify(publish);
  expect(publication).not.toContain(CARD);
  expect(publication).not.toContain(EMAIL);
});
