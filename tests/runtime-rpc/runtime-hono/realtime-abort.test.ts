import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeRuntime } from "relkit/runtime/node";
import { abortAfterReplayAndLive, startRealtimeServer } from "./realtime-abort.case.ts";

// The scenario collects garbage before it aborts: undici links a request's signal to its
// parent through a WeakRef, so on Node a collection can drop the abort before it reaches the
// connection. That is the intermittent hang the audit saw; forcing it makes it deterministic.
setFlagsFromString("--expose-gc");
const scope = globalThis as { gc?: () => void };
scope.gc ??= runInNewContext("gc") as () => void;

// RELKIT_REALTIME_ABORT_REPEAT raises the repetitions when probing for an intermittent hang.
const repetitions = Number(process.env.RELKIT_REALTIME_ABORT_REPEAT ?? 3);
let server: Awaited<ReturnType<typeof startRealtimeServer>>;
beforeAll(async () => {
  server = await startRealtimeServer(nodeRuntime.serve);
});
afterAll(() => server.close());

test(
  "a Node channel stream ends promptly when aborted after a replay and a live event",
  async () => {
    for (let run = 0; run < repetitions; run++) {
      const outcome = await abortAfterReplayAndLive(server);
      expect(outcome.kinds.slice(0, 4)).toEqual(["event", "event", "caught-up", "event"]);
      expect(outcome.endedAfterMs).toBeLessThan(1_000);
      expect(outcome.releasedAfterMs).toBeLessThan(1_000);
    }
  },
  repetitions * 5_000,
);
