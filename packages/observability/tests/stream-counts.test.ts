/** Subscriber count ceilings are independent from byte reservations. */
import { expect, test } from "vitest";
import { createObservabilityStream } from "../src/index.js";

test.each([{}, { queueSize: 256 }, { queueSize: 257 }, { queueSize: 257, maxQueueSize: 257 }])(
  "subscriber count options %j disconnect exactly one over the enforced ceiling",
  (options) => {
    const stream = createObservabilityStream(options);
    const feed = stream.subscribe({ overflow: "disconnect" });
    const limit = "queueSize" in options ? 256 : 64;
    try {
      for (let i = 0; i < limit; i++)
        stream.publish({ type: "log.emitted", data: { message: String(i) } });
      expect(feed.stats()).toMatchObject({ queued: limit, closed: false, dropped: 0 });
      expect(stream.stats().backlogBytes).toBeLessThan(1_048_576);
      stream.publish({ type: "log.emitted", data: { message: "one over" } });
      expect(feed.stats()).toMatchObject({ queued: 0, closed: true, dropped: 1 });
      expect(stream.stats().backlogBytes).toBe(0);
    } finally {
      stream.close();
    }
  },
);
