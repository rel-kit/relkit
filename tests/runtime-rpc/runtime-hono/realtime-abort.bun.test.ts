import { afterAll, beforeAll, expect, test } from "bun:test";
import { bunRuntime } from "relkit/runtime/bun";
import { abortAfterReplayAndLive, startRealtimeServer } from "./realtime-abort.case.ts";

// RELKIT_REALTIME_ABORT_REPEAT raises the repetitions when probing for an intermittent hang.
const repetitions = Number(process.env.RELKIT_REALTIME_ABORT_REPEAT ?? 3);
const scope = globalThis as { gc?: () => void };
scope.gc ??= () => Bun.gc(true);
let server: Awaited<ReturnType<typeof startRealtimeServer>>;
beforeAll(async () => {
  server = await startRealtimeServer(bunRuntime.serve);
});
afterAll(() => server.close());

test(
  "a Bun subscription ends promptly when aborted after a replay and a live event",
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
