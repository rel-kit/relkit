import assert from "node:assert/strict";
import { subscribe } from "inngest/realtime";
import type { Inngest } from "inngest";
import type { NativeStack } from "./native-stack.ts";

const readWithin = async (reader: ReadableStreamDefaultReader<unknown>, timeoutMs = 5_000) => {
  const value = await Promise.race([reader.read(), Bun.sleep(timeoutMs).then(() => undefined)]);
  if (!value) throw new Error(`realtime message not received within ${timeoutMs}ms`);
  return value;
};

export async function runNativeObservationChecks(options: {
  readonly stack: NativeStack;
  readonly client: Inngest;
}) {
  const { stack, client } = options;
  const channel = `relkit/${stack.namespace}/phase-0-observation`;
  const topic = {
    channel,
    topic: "status",
    config: {},
  } as Parameters<Inngest["realtime"]["publish"]>[0];
  const token = await client.realtime.token({ channel, topics: ["status"] });
  const first = await client.realtime.subscribe({ channel, topics: ["status"] });
  const second = await client.realtime.subscribe({ channel, topics: ["status"] });
  const firstReader = first.getJsonStream().getReader();
  const secondReader = second.getJsonStream().getReader();
  await client.realtime.publish(topic, { state: "first" });
  const firstMessages = await Promise.all([readWithin(firstReader), readWithin(secondReader)]);
  first.unsubscribe("one observer disposed");
  await client.realtime.publish(topic, { state: "second" });
  const secondMessage = await readWithin(secondReader);
  const firstEof = await readWithin(firstReader, 1_000);
  assert.equal(firstEof.done, true);
  second.close("last observer disposed");
  const secondEof = await readWithin(secondReader, 1_000);
  assert.equal(secondEof.done, true);

  const invalidToken = await Promise.race([
    subscribe({ ...token, key: "invalid-token" })
      .then((value) => {
        value.close("invalid token probe");
        return "accepted" as const;
      })
      .catch(() => "rejected" as const),
    Bun.sleep(5_000).then(() => "timeout" as const),
  ]);

  return {
    sdk: {
      tokenFields: Object.keys(token),
      streamMethods: ["getJsonStream", "getEncodedStream", "close", "unsubscribe"],
      eofAfterClose: true,
    },
    sharedFeed: {
      firstMessages: firstMessages.map((value) => value.value),
      remainingObserverReceived: secondMessage.value,
      oneObserverCloseDoesNotStopAnother: true,
      lastObserverCloseReachedEof: secondEof.done === true,
    },
    token: {
      invalidToken,
      expiry: "not forced; the local server exposes no test clock or token TTL override",
    },
    cursor: {
      exposed: "cursor" in token,
      retention: "unsupported; the pinned SDK token has no cursor or replay position",
    },
    runObservation: {
      snapshotSubscriptionRace:
        "not-tested; realtime is a live feed and per-run reads are separate",
      terminalEof: "not-certified; EOF is not treated as a terminal run state",
      boundedPolling: "per-run native reads only; no fetch-all polling",
    },
  };
}
