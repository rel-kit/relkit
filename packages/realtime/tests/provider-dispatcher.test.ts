import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { expect, test } from "vitest";
import { createOperationId } from "../src/operation-id.js";
import {
  createProviderRealtimeDispatcher,
  createProviderRealtimeDispatcherEffect,
  readProviderPresenceEffect,
  RealtimeProviderSource,
  triggerProviderEffect,
} from "../src/provider-dispatcher.js";
import type { ProviderRealtimeDispatcherOptions } from "../src/provider-dispatcher.types.js";
import {
  fixtureChannel,
  fixturePresence,
  fixtureProvider,
  fixtureReceipt,
} from "./provider-fixture.js";
import { RealtimeProviderError } from "../src/realtime-errors.js";
import { defineChannel } from "../src/channel.js";
const channel = fixtureChannel();
const request = { channel, params: { id: "one" }, event: "posted", payload: "hello" };
function options(provider = fixtureProvider()): ProviderRealtimeDispatcherOptions {
  return {
    applicationId: "app",
    environment: "test",
    generationId: "g1",
    publicFingerprint: "policy",
    provider: async () => provider,
  };
}
test("replay and member presence use authored limits", async () => {
  const memberChannel = defineChannel({
    id: "members",
    params: z.object({}),
    events: { posted: z.string() },
    client: { authorize: () => true },
    presence: { member: z.string(), resolve: () => "Ada", maxMembers: 7 },
    replay: { retentionMs: 5000, maxEvents: 3 },
  });
  const provider = fixtureProvider({
    append: async (input) => {
      expect(input).toMatchObject({ retentionMs: 5000, maxEvents: 3 });
      return fixtureReceipt();
    },
    readPresence: async (input) => {
      expect(input.maxMembers).toBe(7);
      return fixturePresence();
    },
  });
  const dispatcher = createProviderRealtimeDispatcher(options(provider));
  await dispatcher.trigger({
    channel: memberChannel,
    params: {},
    event: "posted",
    payload: "hello",
  });
  await dispatcher.getPresence({ channel: memberChannel, params: {} });
});
test("trigger and presence use the provider after resolving the epoch", async () => {
  const calls: string[] = [];
  const provider = fixtureProvider({
    getEpoch: async () => {
      calls.push("epoch");
      return "epoch-2";
    },
    append: async (input) => {
      calls.push("append");
      expect(input).toMatchObject({
        channelId: "news",
        event: "posted",
        payload: "hello",
        providerEpoch: "epoch-2",
      });
      expect(input.encodedBytes).toBeGreaterThan(0);
      expect(input.semanticDigest).toBeUndefined();
      return fixtureReceipt();
    },
    readPresence: async (input) => {
      calls.push("presence");
      expect(input.maxMembers).toBeGreaterThan(0);
      return fixturePresence();
    },
  });
  const dispatcher = createProviderRealtimeDispatcher(options(provider));
  expect(await dispatcher.trigger(request)).toMatchObject({ accepted: true });
  expect(await dispatcher.getPresence({ channel, params: { id: "one" } })).toMatchObject({
    connections: 2,
  });
  expect(calls).toEqual(["epoch", "append", "epoch", "presence"]);
});
test("idempotent trigger records a semantic digest and expiry", async () => {
  const id = createOperationId();
  const provider = fixtureProvider({
    append: async (input) => {
      expect(input.operationId).toBe(id);
      expect(input.semanticDigest).toMatch(/^sha256:/);
      expect(input.receiptExpiresAt).toMatch(/Z$/);
      return fixtureReceipt();
    },
  });
  await createProviderRealtimeDispatcher(options(provider)).trigger({
    ...request,
    options: { idempotencyKey: id },
  });
  const expired = createOperationId(0);
  await expect(
    createProviderRealtimeDispatcher(options(provider)).trigger({
      ...request,
      options: { idempotencyKey: expired },
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_WINDOW_EXPIRED" });
});
test("Effect provider service is substitutable and preserves typed failures", async () => {
  const provider = fixtureProvider();
  const layer = Layer.succeed(RealtimeProviderSource, { resolve: () => Effect.succeed(provider) });
  expect(
    await Effect.runPromise(Effect.provide(triggerProviderEffect(options(), request), layer)),
  ).toMatchObject({ accepted: true });
  expect(
    await Effect.runPromise(
      Effect.provide(
        readProviderPresenceEffect(options(), { channel, params: { id: "one" } }),
        layer,
      ),
    ),
  ).toMatchObject({ connections: 2 });
  expect(Effect.runSync(createProviderRealtimeDispatcherEffect(options()))).toHaveProperty(
    "trigger",
  );
  const failing = Layer.succeed(RealtimeProviderSource, {
    resolve: () =>
      Effect.fail(
        new RealtimeProviderError({ operation: "provider.resolve", cause: new Error("offline") }),
      ),
  });
  await expect(
    Effect.runPromise(Effect.provide(triggerProviderEffect(options(), request), failing)),
  ).rejects.toMatchObject({ operation: "provider.resolve" });
});
test("provider lookup, epoch, append, and presence rejections remain visible", async () => {
  const lookup = options();
  const failedLookup = {
    ...lookup,
    provider: async () => {
      throw new Error("lookup failed");
    },
  };
  await expect(createProviderRealtimeDispatcher(failedLookup).trigger(request)).rejects.toThrow(
    "lookup failed",
  );
  const failedEpoch = fixtureProvider({
    getEpoch: async () => {
      throw new Error("epoch failed");
    },
  });
  await expect(
    createProviderRealtimeDispatcher(options(failedEpoch)).trigger(request),
  ).rejects.toThrow("epoch failed");
  await expect(
    createProviderRealtimeDispatcher(options(failedEpoch)).getPresence({
      channel,
      params: { id: "one" },
    }),
  ).rejects.toThrow("epoch failed");
  const failedAppend = fixtureProvider({
    append: async () => {
      throw new Error("append failed");
    },
  });
  await expect(
    createProviderRealtimeDispatcher(options(failedAppend)).trigger(request),
  ).rejects.toThrow("append failed");
  const failedPresence = fixtureProvider({
    readPresence: async () => {
      throw new Error("presence failed");
    },
  });
  await expect(
    createProviderRealtimeDispatcher(options(failedPresence)).getPresence({
      channel,
      params: { id: "one" },
    }),
  ).rejects.toThrow("presence failed");
});
