import { strict as assert } from "node:assert";
import { events, type EventSelectorInput, type UnknownEventEnvelope } from "@relkit/app/events";
import createOrder from "@app/orders/functions/create-order.function.js";
import { receiptObjectName } from "@app/platform/receipt-object.js";

/** Keeps ordinary helper calls opaque to the explicit RelKit dependency surface. */
export function assertOrdinaryHelperIsOpaque(): void {
  assert.equal(receiptObjectName("order-123"), "order-123.json");
  assert.deepEqual(Object.keys(createOrder.dependencies ?? {}).sort(), ["cache", "events"]);
  assert.equal(Object.hasOwn(createOrder, "ordinaryLibrary"), false);
}

const anyOfSelector = events.anyOf("orders.created", "orders.updated", "orders.cancelled");
const patternSelector = events.match("orders.*");

function acceptsAnyOfEnvelope(
  value: EventSelectorInput<typeof anyOfSelector>,
): EventSelectorInput<typeof anyOfSelector> {
  return value;
}

function acceptsPatternEnvelope(
  value: EventSelectorInput<typeof patternSelector>,
): EventSelectorInput<typeof patternSelector> {
  return value;
}

function acceptsTelemetryEnvelope(value: UnknownEventEnvelope): UnknownEventEnvelope {
  return value;
}

void acceptsAnyOfEnvelope;
void acceptsPatternEnvelope;
void acceptsTelemetryEnvelope;

assertOrdinaryHelperIsOpaque();
