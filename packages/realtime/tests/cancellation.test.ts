import { Effect, Fiber, Layer } from "effect";
import { expect, test } from "vitest";
import { getChannelPresenceEffect, triggerChannelEffect } from "../src/channel.js";
import { RealtimeDispatcherService, runWithRealtimeDispatcherEffect } from "../src/dispatch.js";
import {
  createProviderRealtimeDispatcher,
  providerSourceLayer,
  RealtimeProviderSource,
  triggerProviderEffect,
} from "../src/provider-dispatcher.js";
import type { ProviderRealtimeDispatcherOptions } from "../src/provider-dispatcher.types.js";
import type { RealtimeProvider } from "../src/provider.js";
import {
  fixtureChannel,
  fixturePresence,
  fixtureProvider,
  fixtureReceipt,
} from "./provider-fixture.js";
const channel = fixtureChannel();
const trigger = { channel, params: { id: "one" }, event: "posted", payload: "hello" };
function options(
  provider: ProviderRealtimeDispatcherOptions["provider"],
): ProviderRealtimeDispatcherOptions {
  return {
    applicationId: "app",
    environment: "test",
    generationId: "g1",
    publicFingerprint: "policy",
    provider,
  };
}
function abortable<T>(
  signal: AbortSignal | undefined,
  started: () => void,
  released: () => void,
): Promise<T> {
  if (signal === undefined) throw new Error("Missing cancellation signal");
  return new Promise<T>((_resolve, reject) => {
    const abort = () => {
      released();
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    started();
    if (signal.aborted) abort();
  });
}
test("interrupting channel publication aborts the provider append", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  let releases = 0;
  const provider = fixtureProvider({
    append: (_request, requestSignal) => {
      signal = requestSignal;
      return abortable(requestSignal, start, () => {
        releases += 1;
      });
    },
  });
  const dispatcher = createProviderRealtimeDispatcher(options(() => provider));
  const fiber = Effect.runFork(
    Effect.provide(
      triggerChannelEffect(channel, trigger.params, trigger.event, trigger.payload),
      Layer.succeed(RealtimeDispatcherService, dispatcher),
    ),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  expect(releases).toBe(1);
});
test("interrupting presence reads aborts the provider request", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  let releases = 0;
  const provider = fixtureProvider({
    readPresence: (_request, requestSignal) => {
      signal = requestSignal;
      return abortable(requestSignal, start, () => {
        releases += 1;
      });
    },
  });
  const dispatcher = createProviderRealtimeDispatcher(options(() => provider));
  const fiber = Effect.runFork(
    Effect.provide(
      getChannelPresenceEffect(channel, trigger.params),
      Layer.succeed(RealtimeDispatcherService, dispatcher),
    ),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  expect(releases).toBe(1);
});
test("interrupting provider lookup aborts its Promise boundary", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  let releases = 0;
  const lookup = options((_profile, requestSignal) => {
    signal = requestSignal;
    return abortable<RealtimeProvider>(requestSignal, start, () => {
      releases += 1;
    });
  });
  const fiber = Effect.runFork(
    Effect.provide(triggerProviderEffect(lookup, trigger), providerSourceLayer(lookup)),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  expect(releases).toBe(1);
});
test("interrupting provider epoch reads aborts that Promise boundary", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  let releases = 0;
  const provider = fixtureProvider({
    getEpoch: (requestSignal) => {
      signal = requestSignal;
      return abortable(requestSignal, start, () => {
        releases += 1;
      });
    },
  });
  const lookup = options(() => provider);
  const fiber = Effect.runFork(
    Effect.provide(
      triggerProviderEffect(lookup, trigger),
      Layer.succeed(RealtimeProviderSource, { resolve: () => Effect.succeed(provider) }),
    ),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  expect(releases).toBe(1);
});
test("interrupting an async scoped action aborts the action signal", async () => {
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  let releases = 0;
  const dispatcher = {
    trigger: async () => fixtureReceipt(),
    getPresence: async () => fixturePresence(),
  };
  const fiber = Effect.runFork(
    runWithRealtimeDispatcherEffect(dispatcher, (actionSignal) => {
      signal = actionSignal;
      return abortable(actionSignal, start, () => {
        releases += 1;
      });
    }),
  );
  await started;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal?.aborted).toBe(true);
  expect(releases).toBe(1);
});
