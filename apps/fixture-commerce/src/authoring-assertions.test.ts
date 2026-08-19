import { strict as assert } from "node:assert";
import { events, type EventSelectorInput, type UnknownEventEnvelope } from "@zsys/app";
import type { InferInput } from "@zsys/schema";
import createOrder from "./functions/create-order.function.js";
import auditOrderChange from "./functions/audit-order-change.function.js";
import captureEventTelemetry from "./functions/capture-event-telemetry.function.js";
import projectOrderChange from "./functions/project-order-change.function.js";
import orderCancelled from "./events/order-cancelled.event.js";
import orderCreated from "./events/order-created.event.js";
import orderUpdated from "./events/order-updated.event.js";
import { receiptObjectName } from "./shared/receipt-object.js";

/** Keeps ordinary helper calls opaque to the explicit ZSys dependency surface. */
export function assertOrdinaryHelperIsOpaque(): void {
  assert.equal(receiptObjectName("order-123"), "order-123.json");
  assert.deepEqual(Object.keys(createOrder.dependencies ?? {}).sort(), ["cache", "events", "jobs"]);
  assert.equal(Object.hasOwn(createOrder, "ordinaryLibrary"), false);
}

const anyOfSelector = events.anyOf(orderCreated, orderUpdated, orderCancelled);
const patternSelector = events.match("orders.*");

function acceptsAnyOfEnvelope(
  value: InferInput<typeof projectOrderChange.input>,
): EventSelectorInput<typeof anyOfSelector> {
  return value;
}

function acceptsPatternEnvelope(
  value: InferInput<typeof auditOrderChange.input>,
): EventSelectorInput<typeof patternSelector> {
  return value;
}

function acceptsTelemetryEnvelope(
  value: InferInput<typeof captureEventTelemetry.input>,
): UnknownEventEnvelope {
  return value;
}

void acceptsAnyOfEnvelope;
void acceptsPatternEnvelope;
void acceptsTelemetryEnvelope;

assertOrdinaryHelperIsOpaque();
