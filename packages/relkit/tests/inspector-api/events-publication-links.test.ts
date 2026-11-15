/** A publication row carries the ids that link it to its trace and to the request that caused it. */
import { expect, test } from "vitest";
import { projectPublication } from "../../src/inspector-api/events-projection.js";

test("a projected publication keeps its trace and request ids and no payload", () => {
  const [row] = projectPublication({
    eventId: "orders.created",
    instanceId: "event-instance-1",
    version: 1,
    timestamp: 1_800_000_000_000,
    traceId: "trace-consumer",
    producerTraceId: "trace-producer",
    originRequestId: "request-1",
    payload: { secret: "value" },
  });
  expect(row).toMatchObject({
    eventId: "orders.created",
    producerTraceId: "trace-producer",
    originRequestId: "request-1",
  });
  expect(row).not.toHaveProperty("payload");
});
