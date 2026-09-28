import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import {
  defineChannel,
  defineChannelEffect,
  getChannelPresenceEffect,
  isChannelDescriptor,
  isChannelDescriptorEffect,
  triggerChannelEffect,
} from "../src/channel.js";
import { runChannelPromise } from "../src/channel-operations.js";
import {
  RealtimeDispatcherService,
  runWithRealtimeDispatcher,
  setActiveRealtimeDispatcher,
} from "../src/dispatch.js";
import { fixturePresence, fixtureReceipt } from "./provider-fixture.js";
const options = {
  id: "news",
  params: z.object({ id: z.string() }),
  events: { posted: z.string() },
  client: { public: true as const },
  presence: "count" as const,
};
test("Effect construction freezes descriptors and exposes compatibility methods", () => {
  const channel = Effect.runSync(defineChannelEffect(options));
  expect(Object.isFrozen(channel)).toBe(true);
  expect(Object.keys(channel)).not.toContain("trigger");
  expect(isChannelDescriptor(channel)).toBe(true);
  expect(Effect.runSync(isChannelDescriptorEffect(channel))).toBe(true);
  expect(Effect.runSync(isChannelDescriptorEffect({}))).toBe(false);
  expect(Effect.runSync(isChannelDescriptorEffect({ type: "channel" }))).toBe(false);
  expect(
    defineChannel({
      ...options,
      profile: "secondary",
      replay: { retentionMs: 1000, maxEvents: 2 },
    }),
  ).toMatchObject({ profile: "secondary", replay: { maxEvents: 2 } });
});
test("construction reports tagged failures and TypeError adapters", () => {
  expect(Effect.runSync(Effect.flip(defineChannelEffect(null as never)))).toMatchObject({
    operation: "channel.define",
  });
  expect(
    Effect.runSync(
      Effect.flip(defineChannelEffect({ ...options, events: {}, presence: undefined })),
    ),
  ).toMatchObject({
    _tag: "Realtime.ChannelValidationError",
    operation: "channel.define",
  });
  expect(() => defineChannel({ ...options, events: {}, presence: undefined })).toThrow(
    "must declare presence",
  );
  expect(() => defineChannel({ ...options, params: {} as never })).toThrow("params");
  expect(() => defineChannel({ ...options, profile: "" })).toThrow();
  expect(() => defineChannel({ ...options, id: "" })).toThrow();
});
test("trigger validates parameters and payload before dispatch", async () => {
  const channel = defineChannel(options);
  const events: string[] = [];
  const dispatcher = {
    trigger: async ({ event }: { event: string }) => {
      events.push(event);
      return fixtureReceipt();
    },
    getPresence: async () => fixturePresence(),
  };
  expect(
    await runWithRealtimeDispatcher(dispatcher, () =>
      channel.trigger({ id: "one" }, "posted", "hello"),
    ),
  ).toMatchObject({ accepted: true });
  expect(events).toEqual(["posted"]);
  await expect(
    runWithRealtimeDispatcher(dispatcher, () =>
      channel.trigger({ id: 1 } as never, "posted", "hello"),
    ),
  ).rejects.toThrow("params validation failed");
  await expect(
    runWithRealtimeDispatcher(dispatcher, () =>
      channel.trigger({ id: "one" }, "posted", 1 as never),
    ),
  ).rejects.toThrow("payload validation failed");
  const unknown = await Effect.runPromise(
    Effect.flip(triggerChannelEffect(channel, { id: "one" }, "missing", "hello")),
  );
  expect(unknown).toMatchObject({
    operation: "channel.trigger",
    reason: 'Unknown channel event "missing"',
  });
  expect(events).toEqual(["posted"]);
});
test("Effect operations use a dispatcher supplied by a Layer", async () => {
  const channel = defineChannel(options);
  const calls: string[] = [];
  const layer = Layer.succeed(RealtimeDispatcherService, {
    trigger: ({ event }) => {
      calls.push(event);
      return fixtureReceipt();
    },
    getPresence: () => fixturePresence(),
  });
  expect(
    await Effect.runPromise(
      Effect.provide(triggerChannelEffect(channel, { id: "one" }, "posted", "hi"), layer),
    ),
  ).toMatchObject({ accepted: true });
  expect(
    await Effect.runPromise(
      Effect.provide(getChannelPresenceEffect(channel, { id: "one" }), layer),
    ),
  ).toMatchObject({ connections: 2 });
  expect(calls).toEqual(["posted"]);
});
test("the internal Promise adapter preserves unexpected typed failures", async () => {
  const error = new Error("unexpected");
  await expect(runChannelPromise(Effect.fail(error))).rejects.toBe(error);
});
test("presence and provider failures retain typed Effect paths and Promise rejections", async () => {
  const channel = defineChannel(options);
  const dispatcher = {
    trigger: async () => {
      throw new Error("append unavailable");
    },
    getPresence: async () => fixturePresence(),
  };
  expect(
    await runWithRealtimeDispatcher(dispatcher, () => channel.getPresence({ id: "one" })),
  ).toMatchObject({ connections: 2 });
  const presence = await runWithRealtimeDispatcher(dispatcher, () =>
    Effect.runPromise(getChannelPresenceEffect(channel, { id: "one" })),
  );
  expect(presence).toMatchObject({ status: "fresh" });
  await expect(
    runWithRealtimeDispatcher(dispatcher, () => channel.trigger({ id: "one" }, "posted", "hello")),
  ).rejects.toThrow("append unavailable");
  const failure = await runWithRealtimeDispatcher(dispatcher, () =>
    Effect.runPromise(Effect.flip(triggerChannelEffect(channel, { id: "one" }, "posted", "hello"))),
  );
  expect(failure).toMatchObject({ _tag: "Realtime.ProviderError", operation: "channel.trigger" });
  setActiveRealtimeDispatcher(undefined);
  expect(
    await Effect.runPromise(Effect.flip(getChannelPresenceEffect(channel, { id: "one" }))),
  ).toMatchObject({
    _tag: "Realtime.DispatcherError",
  });
  await expect(channel.getPresence({ id: "one" })).rejects.toThrow(
    "No realtime dispatcher is active.",
  );
  const failedPresence = {
    trigger: async () => fixtureReceipt(),
    getPresence: async () => {
      throw new Error("presence unavailable");
    },
  };
  await expect(
    runWithRealtimeDispatcher(failedPresence, () => channel.getPresence({ id: "one" })),
  ).rejects.toThrow("presence unavailable");
});
