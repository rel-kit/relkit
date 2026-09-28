import { REALTIME_RUNTIME_LIMITS } from "@relkit/contracts";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, test } from "vitest";
import { createOperationId } from "../src/operation-id.js";
import { providerSourceLayer, triggerProviderEffect } from "../src/provider-dispatcher.js";
import type { AppendChannelEvent } from "../src/provider.js";
import { fixtureChannel, fixtureProvider, fixtureReceipt } from "./provider-fixture.js";

test("provider timestamps and receipt expiry use the supplied TestClock", async () => {
  const now = Date.UTC(2026, 8, 7);
  const id = createOperationId(now);
  let appended: AppendChannelEvent | undefined;
  const provider = fixtureProvider({
    append: async (request) => {
      appended = request;
      return fixtureReceipt();
    },
  });
  const options = {
    applicationId: "app",
    environment: "test",
    generationId: "g1",
    publicFingerprint: "policy",
    provider: async () => provider,
  };
  const program = Effect.gen(function* () {
    yield* TestClock.setTime(now);
    yield* triggerProviderEffect(options, {
      channel: fixtureChannel(),
      params: { id: "one" },
      event: "posted",
      payload: "hello",
      options: { idempotencyKey: id },
    });
  });
  await Effect.runPromise(
    Effect.provide(program, Layer.merge(providerSourceLayer(options), TestClock.layer())),
  );
  expect(appended?.occurredAt).toBe(new Date(now).toISOString());
  expect(appended?.receiptExpiresAt).toBe(
    new Date(now + REALTIME_RUNTIME_LIMITS.triggerReceiptMs).toISOString(),
  );
});
