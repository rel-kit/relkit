import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import {
  assertChannelSchema,
  assertChannelSchemaEffect,
  copyChannelEvents,
  copyChannelEventsEffect,
  isChannelSchema,
  isChannelSchemaEffect,
  isRecord,
  isRecordEffect,
  validateChannelValue,
  validateChannelValueEffect,
} from "../src/channel-validation.js";
import {
  copyChannelClient,
  copyChannelClientEffect,
  copyChannelPresence,
  copyChannelPresenceEffect,
  copyChannelReplay,
  copyChannelReplayEffect,
} from "../src/channel-policy.js";
import { RealtimeTelemetry } from "../src/realtime-observability.js";
test("schema and record guards have Effect and compatibility paths", () => {
  const schema = z.string();
  expect(Effect.runSync(isRecordEffect({}))).toBe(true);
  expect(isRecord([])).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(Effect.runSync(isChannelSchemaEffect(schema))).toBe(true);
  expect(isChannelSchema({ "~standard": { version: 2, validate: () => ({ value: 1 }) } })).toBe(
    false,
  );
  expect(isChannelSchema({ "~standard": { version: 1 } })).toBe(false);
  expect(Effect.runSync(assertChannelSchemaEffect(schema, "params"))).toBeUndefined();
  assertChannelSchema(schema, "params");
  expect(Effect.runSync(Effect.flip(assertChannelSchemaEffect({}, "params")))).toMatchObject({
    _tag: "Realtime.ChannelValidationError",
    operation: "channel.assertSchema",
  });
  expect(() => assertChannelSchema({}, "params")).toThrow("Standard Schema");
});
test("nested validation helpers use the supplied telemetry Layer", () => {
  const observed: string[] = [];
  const telemetry = Layer.succeed(RealtimeTelemetry, {
    observe: (operation, effect) => {
      observed.push(operation);
      return effect;
    },
  });
  expect(Effect.runSync(Effect.provide(isChannelSchemaEffect(z.string()), telemetry))).toBe(true);
  expect(
    Effect.runSync(Effect.provide(copyChannelClientEffect({ public: true }), telemetry)),
  ).toEqual({
    public: true,
  });
  expect(observed.filter((operation) => operation === "channel.isRecord")).toHaveLength(3);
  expect(observed).toContain("channel.isSchema");
  expect(observed).toContain("channel.copyClient");
});
test("value validation resolves synchronous and asynchronous standard schemas", async () => {
  const schema = z.string();
  expect(await Effect.runPromise(validateChannelValueEffect(schema, "hello", "params"))).toBe(
    "hello",
  );
  expect(await validateChannelValue(schema, "hello", "params")).toBe("hello");
  expect(
    await Effect.runPromise(Effect.flip(validateChannelValueEffect(schema, 1, "params"))),
  ).toMatchObject({
    _tag: "Realtime.ChannelValidationError",
    operation: "channel.validateValue",
  });
  await expect(validateChannelValue(schema, 1, "params")).rejects.toThrow("validation failed");
  const rejecting = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: async () => {
        throw new Error("bad");
      },
    },
  };
  expect(
    await Effect.runPromise(Effect.flip(validateChannelValueEffect(rejecting, "x", "payload"))),
  ).toMatchObject({
    operation: "channel.validateValue",
  });
  await expect(validateChannelValue(rejecting, "x", "payload")).rejects.toThrow("bad");
});
test("event map copies are frozen and reject invalid names and validators", () => {
  const events = Effect.runSync(copyChannelEventsEffect({ posted: z.string() }));
  expect(Object.isFrozen(events)).toBe(true);
  expect(copyChannelEvents({ posted: z.string() })).toHaveProperty("posted");
  expect(Effect.runSync(Effect.flip(copyChannelEventsEffect(null)))).toMatchObject({
    operation: "channel.copyEvents",
  });
  expect(() => copyChannelEvents({ bad: {} })).toThrow("event bad");
  expect(() => copyChannelEvents({ "": z.string() })).toThrow();
});
test("client policies reject ambiguous or extra keys", () => {
  expect(Effect.runSync(copyChannelClientEffect(undefined))).toBeUndefined();
  expect(copyChannelClient({ public: true })).toEqual({ public: true });
  const authorize = () => true;
  expect(copyChannelClient({ authorize })).toEqual({ authorize });
  expect(Effect.runSync(Effect.flip(copyChannelClientEffect(1)))).toMatchObject({
    operation: "channel.copyClient",
  });
  expect(() => copyChannelClient({ public: true, extra: true })).toThrow("exclusively");
  expect(() => copyChannelClient({ public: true, authorize })).toThrow("exclusively");
});
test("presence and replay require valid positive limits", () => {
  const client = { authorize: () => true };
  expect(copyChannelPresence(undefined, client)).toBeUndefined();
  expect(copyChannelPresence("count", undefined)).toBe("count");
  const member = { member: z.string(), resolve: () => "Ada", maxMembers: 3 };
  expect(Effect.runSync(copyChannelPresenceEffect(member, client))).toMatchObject({
    maxMembers: 3,
  });
  expect(() => copyChannelPresence(member, undefined)).toThrow("protected channel");
  expect(() => copyChannelPresence(member, { public: true })).toThrow("protected channel");
  expect(() => copyChannelPresence({ ...member, maxMembers: 0 }, client)).toThrow(
    "positive integer",
  );
  expect(() =>
    copyChannelPresence({ member: {}, resolve: () => "Ada", maxMembers: 1 }, client),
  ).toThrow("requires member");
  expect(Effect.runSync(copyChannelReplayEffect(undefined))).toBeUndefined();
  expect(copyChannelReplay({ retentionMs: 10, maxEvents: 2 })).toEqual({
    retentionMs: 10,
    maxEvents: 2,
  });
  expect(() => copyChannelReplay(null)).toThrow("object");
  expect(() => copyChannelReplay({ retentionMs: 0, maxEvents: 1 })).toThrow("positive integer");
  expect(() => copyChannelReplay({ retentionMs: 1, maxEvents: 0 })).toThrow("positive integer");
});
