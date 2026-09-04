import { expect, test } from "bun:test";
import { createObservabilityCollector, createObservabilityStream } from "./src/index.ts";

test("publishes versioned redacted events with bounded monotonic replay", () => {
  const stream = createObservabilityStream({
    maxEvents: 2,
    collector: createObservabilityCollector(),
  });
  const first = stream.publish({ type: "log.emitted", record: log("first") });
  const second = stream.publish({ type: "log.emitted", record: log("second") });
  const third = stream.publish({ type: "diagnostic.changed", data: { token: "secret", ok: true } });

  expect([first?.cursor, second?.cursor, third?.cursor]).toEqual(["1", "2", "3"]);
  expect(first?.data).toMatchObject({ functionId: "orders.get", serviceId: "orders" });
  expect(JSON.stringify(first)).not.toContain("tenant-1");
  expect(JSON.stringify(third)).not.toContain("secret");
  expect(stream.replay({ cursor: "1" }).events.map((event) => event.cursor)).toEqual(["2", "3"]);
  expect(stream.replay("2").events[0]?.type).toBe("diagnostic.changed");
  expect(() => stream.replay({ cursor: "0" })).toThrow(
    "Stream cursor is older than retained events",
  );
  expect(stream.counters()).toMatchObject({ published: 3, retainedDropped: 1, dropped: 1 });
});

test("replays on reconnect and applies explicit subscriber backpressure", async () => {
  const stream = createObservabilityStream({ maxEvents: 5, queueSize: 1 });
  stream.publish({ type: "log.emitted", data: { message: "one" } });
  stream.publish({ type: "log.emitted", data: { message: "two" } });
  const reconnect = stream.subscribe({ cursor: "1", queueSize: 2 });
  expect((await reconnect.next()).value.data).toMatchObject({ message: "two" });

  const slow = stream.subscribe({ cursor: "2", queueSize: 1, overflow: "drop-newest" });
  stream.publish({ type: "log.emitted", data: { message: "three" } });
  stream.publish({ type: "log.emitted", data: { message: "four" } });
  expect((await slow.next()).value.data).toMatchObject({ message: "three" });
  expect(slow.dropped()).toBe(1);
  expect(stream.stats()).toMatchObject({ subscriberDropped: 1, subscribers: 2 });

  const disconnected = stream.subscribe({ cursor: "4", queueSize: 1, overflow: "disconnect" });
  stream.publish({ type: "log.emitted", data: { message: "five" } });
  stream.publish({ type: "log.emitted", data: { message: "six" } });
  expect(disconnected.stats()).toMatchObject({ closed: true, dropped: 1 });
  expect((await disconnected.next()).done).toBe(true);
  reconnect.close();
  slow.close();
  stream.close();
});

test("accepts every required event type and exposes drop counters", () => {
  const stream = createObservabilityStream({ maxEvents: 20 });
  for (const type of [
    "request.started",
    "request.completed",
    "log.emitted",
    "span.started",
    "span.completed",
    "job.changed",
    "event.published",
    "event.delivery.changed",
    "generation.changed",
    "diagnostic.changed",
  ] as const) {
    stream.emit({ type, data: { event: type, password: "hidden" } });
  }
  expect(stream.replay().events).toHaveLength(10);
  expect(stream.replay().events.map((event) => event.type)).toEqual([
    "request.started",
    "request.completed",
    "log.emitted",
    "span.started",
    "span.completed",
    "job.changed",
    "event.published",
    "event.delivery.changed",
    "generation.changed",
    "diagnostic.changed",
  ]);
  expect(JSON.stringify(stream.replay())).not.toContain("hidden");
  expect(stream.dropped()).toBe(0);
});

function log(message: string) {
  return {
    version: 2 as const,
    signal: "log" as const,
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info" as const,
    component: "test",
    message,
    fields: { service: { tenant: "tenant-1" }, token: "secret" },
    functionId: "orders.get",
    serviceId: "orders",
  };
}
