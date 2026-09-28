import { describe, expect, test, vi } from "vitest";
import { Effect, Exit, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { EventPublisher, publishEventEffect } from "../src/client-publish.js";
import { EventIdentity } from "../src/client-result.js";
import { EventTelemetry } from "../src/event-observability.js";
import { EventOperationCancelledError, EventOperationTimeoutError } from "../src/client-errors.js";

const setup = (extra: Record<string, unknown> = {}) => ({
  options: {
    ownerId: "orders.create",
    eventId: "orders.created",
    version: 1 as const,
    source: {},
    ...extra,
  },
  ownerId: "orders.create",
  eventId: "orders.created",
  version: 1 as const,
  profile: "default",
  declared: true,
});

describe("published work lifecycle", () => {
  test("interrupts provider work and aborts its signal with the outer Effect", async () => {
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let released = false;
    let providerSignal: AbortSignal | undefined;
    const publisher = Layer.succeed(
      EventPublisher,
      EventPublisher.of({
        publish: (_payload, _options, context) =>
          Effect.acquireUseRelease(
            Effect.sync(() => {
              providerSignal = context.signal;
              started();
            }),
            () => Effect.never,
            () =>
              Effect.sync(() => {
                released = true;
              }),
          ),
      }),
    );
    const fiber = Effect.runFork(publishEventEffect(setup(), {}).pipe(Effect.provide(publisher)));
    await ready;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(released).toBe(true);
    expect(providerSignal?.aborted).toBe(true);
  });

  test("enforces external cancellation through an invocation bridge", async () => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let released = false;
    const publisher = Layer.succeed(
      EventPublisher,
      EventPublisher.of({
        publish: () =>
          Effect.acquireUseRelease(
            Effect.sync(started),
            () => Effect.never,
            () =>
              Effect.sync(() => {
                released = true;
              }),
          ),
      }),
    );
    const pending = Effect.runPromise(
      Effect.flip(
        publishEventEffect(
          setup({
            signal: () => controller.signal,
            bridge: { run: (work: () => Promise<unknown>) => work() },
          }),
          {},
        ).pipe(Effect.provide(publisher)),
      ),
    );
    await ready;
    controller.abort();
    expect(await pending).toBeInstanceOf(EventOperationCancelledError);
    expect(released).toBe(true);
  });

  test("enforces a bridge deadline with TestClock and releases provider work", async () => {
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let released = false;
    const publisher = Layer.succeed(
      EventPublisher,
      EventPublisher.of({
        publish: () =>
          Effect.acquireUseRelease(
            Effect.sync(started),
            () => Effect.never,
            () =>
              Effect.sync(() => {
                released = true;
              }),
          ),
      }),
    );
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          publishEventEffect(
            setup({
              deadline: () => 100,
              bridge: { run: (work: () => Promise<unknown>) => work() },
            }),
            {},
          ).pipe(Effect.provide(publisher)),
        );
        yield* Effect.promise(() => ready);
        yield* TestClock.adjust(101);
        return yield* Effect.flip(Fiber.join(fiber));
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(failure).toBeInstanceOf(EventOperationTimeoutError);
    expect(released).toBe(true);
  });

  test("does not start provider work when a bridge calls back after cancellation", async () => {
    const controller = new AbortController();
    let bridgeWork: (() => Promise<unknown>) | undefined;
    let registered: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      registered = resolve;
    });
    const publish = vi.fn(() => Effect.succeed({ accepted: true as const }));
    const publisher = Layer.succeed(EventPublisher, EventPublisher.of({ publish }));
    const pending = Effect.runPromise(
      Effect.flip(
        publishEventEffect(
          setup({
            signal: () => controller.signal,
            bridge: {
              run: (work: () => Promise<unknown>) => {
                bridgeWork = work;
                registered();
                return new Promise(() => {});
              },
            },
          }),
          {},
        ).pipe(Effect.provide(publisher)),
      ),
    );
    await ready;
    controller.abort();
    expect(await pending).toBeInstanceOf(EventOperationCancelledError);
    await expect(bridgeWork?.()).rejects.toBeInstanceOf(EventOperationCancelledError);
    expect(publish).not.toHaveBeenCalled();
  });

  test("preserves identity and telemetry Layers inside provider work", async () => {
    const observed: string[] = [];
    const publisher = Layer.succeed(
      EventPublisher,
      EventPublisher.of({ publish: () => Effect.succeed({ accepted: true as const }) }),
    );
    const identity = Layer.succeed(
      EventIdentity,
      EventIdentity.of({ now: () => new Date(0), nextId: () => "fixed-id" }),
    );
    const telemetry = Layer.succeed(
      EventTelemetry,
      EventTelemetry.of({
        observe: (operation, effect) =>
          Effect.onExit(effect, (exit) =>
            Effect.sync(() => {
              observed.push(`${operation}:${Exit.isSuccess(exit) ? "success" : "failure"}`);
            }),
          ),
      }),
    );
    const result = await Effect.runPromise(
      publishEventEffect(setup(), {}).pipe(
        Effect.provide(publisher),
        Effect.provide(identity),
        Effect.provide(telemetry),
      ),
    );
    expect(result.instanceId).toBe("fixed-id");
    expect(result.occurredAt).toBe(new Date(0).toISOString());
    expect(observed).toContain("client.parsePayload:success");
    expect(observed).toContain("client.normalizeResult:success");
  });
});
