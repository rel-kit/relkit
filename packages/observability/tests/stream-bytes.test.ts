/** Byte ceilings count complete UTF-8 envelopes and release budgets when readers leave. */
import { expect, test } from "vitest";
import { streamSubscriberCore } from "../src/stream-subscriber-core.js";
import { makeStreamBudget } from "../src/stream-budget.js";
import type { ObservabilityStreamEvent } from "../src/stream-types.js";

/** Constructs an envelope of exactly the requested UTF-8 size. */
function event(bytes: number): ObservabilityStreamEvent {
  const base = {
    protocol: "relkit.observability.stream" as const,
    version: 1 as const,
    cursor: "1",
    type: "log.emitted" as const,
    data: "",
  };
  return { ...base, data: "x".repeat(bytes - Buffer.byteLength(JSON.stringify(base))) };
}

test("one subscriber accepts exactly one MiB and disconnects one byte over", () => {
  const budget = makeStreamBudget();
  const feed = streamSubscriberCore.createStreamSubscriber(
    "one",
    256,
    "disconnect",
    () => {},
    () => {},
    budget,
  );
  feed.enqueue(event(1_048_576));
  expect(feed.stats()).toMatchObject({ queuedBytes: 1_048_576, closed: false });
  feed.enqueue(event(200));
  expect(feed.stats()).toMatchObject({ queuedBytes: 0, closed: true, dropped: 1 });
  expect(budget.bytes()).toBe(0);
  const oversized = streamSubscriberCore.createStreamSubscriber(
    "over",
    256,
    "disconnect",
    () => {},
    () => {},
    budget,
  );
  oversized.enqueue(event(1_048_577));
  expect(oversized.stats()).toMatchObject({ closed: true, dropped: 1 });
});

test("aggregate backlog is at most four MiB and draining returns its exact reservation", async () => {
  const budget = makeStreamBudget();
  const feeds = Array.from({ length: 5 }, (_, i) =>
    streamSubscriberCore.createStreamSubscriber(
      String(i),
      256,
      "disconnect",
      () => {},
      () => {},
      budget,
    ),
  );
  for (const feed of feeds) feed.enqueue(event(1_048_576));
  expect(budget.bytes()).toBe(4_194_304);
  expect(feeds[4]!.stats().closed).toBe(true);
  await feeds[0]!.next();
  expect(budget.bytes()).toBe(3_145_728);
  for (const feed of feeds) feed.close();
  expect(budget.bytes()).toBe(0);
});
