import { Effect } from "effect";
import { expect, test } from "vitest";
import { digestEffect, encodedBytesEffect, providerScopeEffect } from "../src/provider-encoding.js";
import { limitsForEffect } from "../src/provider-dispatcher.js";
import type { ProviderRealtimeDispatcherOptions } from "../src/provider-dispatcher.types.js";
import { fixtureProvider } from "./provider-fixture.js";
const options: ProviderRealtimeDispatcherOptions = {
  applicationId: "app",
  environment: "test",
  generationId: "g1",
  publicFingerprint: "policy",
  provider: async () => fixtureProvider(),
};
test("provider encoding computes deterministic scope and byte counts", () => {
  const value = Effect.runSync(digestEffect({ id: "one" }));
  expect(value).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(Effect.runSync(encodedBytesEffect({ event: "é" }))).toBeGreaterThan(10);
  expect(
    Effect.runSync(providerScopeEffect(options, "news", "default", { id: "one" })),
  ).toMatchObject({
    applicationId: "app",
    channelId: "news",
    profile: "default",
    partition: value,
    identityScope: "runtime:g1",
    sessionEpoch: "g1",
  });
  const circular: { self?: unknown } = {};
  circular.self = circular;
  expect(Effect.runSync(Effect.flip(digestEffect(circular)))).toMatchObject({
    _tag: "Realtime.ProviderError",
  });
  expect(Effect.runSync(Effect.flip(encodedBytesEffect(circular)))).toMatchObject({
    operation: "provider.bytes",
  });
  expect(
    Effect.runSync(limitsForEffect({ ...options, limits: { maxEventBytes: 10 } })).maxEventBytes,
  ).toBe(10);
});
