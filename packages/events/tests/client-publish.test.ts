import { describe, expect, test, vi } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { createEventClient, createEventClientEffect } from "../src/client.js";
import { EventPublisher, publishEventEffect } from "../src/client-publish.js";
import { EventWorkFailed } from "../src/client-operation.js";
import {
  EventDependencyError,
  EventOperationCancelledError,
  EventOperationTimeoutError,
  EventPayloadValidationError,
  EventProfileError,
  EventProviderError,
} from "../src/client-errors.js";

const schema = z.object({ id: z.string() });
const response = { accepted: true as const, instanceId: "event-1" };
const provider = { publish: vi.fn(async () => response) };
const options = () => ({
  ownerId: "orders.create",
  eventId: "orders.created",
  version: 1 as const,
  payloadSchema: schema,
  source: provider,
  now: () => new Date(1000),
});

describe("event publishing", () => {
  test("publishes validated input and returns correlated metadata", async () => {
    provider.publish.mockClear();
    const declared = vi.fn();
    const observed = vi.fn();
    const client = createEventClient({
      ...options(),
      onDeclaredEdge: declared,
      onObservedEdge: observed,
    });
    expect(declared).toHaveBeenCalledWith({
      kind: "publishes-event",
      from: "orders.create",
      to: "orders.created",
    });
    const result = await client.publish(
      { id: "one" },
      { key: "key-1", attributes: { source: "test" } },
    );
    expect(result).toMatchObject({
      accepted: true,
      instanceId: "event-1",
      eventId: "orders.created",
      version: 1,
      payload: { id: "one" },
      key: "key-1",
      attributes: { source: "test" },
    });
    expect(provider.publish).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledWith({
      relationship: "publishes-event",
      from: "orders.create",
      to: "orders.created",
    });
  });

  test("does not send invalid payloads to the provider", async () => {
    provider.publish.mockClear();
    const client = createEventClient(options());
    await expect(client.publish({ id: 1 } as never)).rejects.toBeInstanceOf(
      EventPayloadValidationError,
    );
    expect(provider.publish).not.toHaveBeenCalled();
  });

  test("rejects undeclared dependencies after observing the attempt", async () => {
    const observed = vi.fn();
    const declared = vi.fn();
    const client = createEventClient({
      ...options(),
      declared: false,
      source: {},
      onDeclaredEdge: declared,
      onObservedEdge: observed,
    });
    await expect(client.publish({ id: "one" })).rejects.toBeInstanceOf(EventDependencyError);
    expect(declared).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
  });

  test("rejects pre-cancelled and expired work before the provider starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = createEventClient({ ...options(), signal: () => controller.signal });
    provider.publish.mockClear();
    await expect(cancelled.publish({ id: "one" })).rejects.toBeInstanceOf(
      EventOperationCancelledError,
    );
    expect(provider.publish).not.toHaveBeenCalled();
    const expired = createEventClient({ ...options(), deadline: () => Date.now() - 1 });
    await expect(expired.publish({ id: "one" })).rejects.toBeInstanceOf(EventOperationTimeoutError);
    expect(provider.publish).not.toHaveBeenCalled();
  });

  test("preserves provider rejection and reports configuration errors", async () => {
    const cause = new Error("broker unavailable");
    const client = createEventClient({
      ...options(),
      source: { publish: () => Promise.reject(cause) },
    });
    await expect(client.publish({ id: "one" })).rejects.toBe(cause);
    expect(() => createEventClient({ ...options(), source: {} })).toThrow(EventProfileError);
    expect(() => createEventClient({ ...options(), source: { default: {} } })).toThrow(
      EventProviderError,
    );
    expect(() => createEventClient({ ...options(), version: 0 as never })).toThrow(
      "positive integer",
    );
    expect(() => createEventClient({ ...options(), ownerId: "invalid id" })).toThrow(
      "Invalid stable ID",
    );
  });

  test("runs through a supplied invocation bridge", async () => {
    const bridge = vi.fn(async <A>(work: () => Promise<A>) => work());
    const client = createEventClient({ ...options(), bridge: { run: bridge } });
    expect((await client.publish({ id: "one" })).instanceId).toBe("event-1");
    expect(bridge).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        name: "relkit.event.orders.created.publish",
        kind: "producer",
      }),
    );
  });

  test("uses the framework span when a bridge declines the operation", async () => {
    const client = createEventClient({
      ...options(),
      bridge: { run: () => undefined as never },
    });
    expect((await client.publish({ id: "one" })).accepted).toBe(true);
  });

  test("uses a test Layer to replace the provider in the Effect path", async () => {
    const setup = {
      options: options(),
      ownerId: "orders.create",
      eventId: "orders.created",
      version: 1 as const,
      profile: "default",
      declared: true,
    };
    const seen: unknown[] = [];
    const layer = Layer.succeed(
      EventPublisher,
      EventPublisher.of({
        publish: (payload) =>
          Effect.sync(() => {
            seen.push(payload);
            return { accepted: true as const, instanceId: "layer-event" };
          }),
      }),
    );
    const result = await Effect.runPromise(
      publishEventEffect(setup, { id: "two" }).pipe(Effect.provide(layer)),
    );
    expect(result.instanceId).toBe("layer-event");
    expect(seen).toEqual([{ id: "two" }]);
  });

  test("exposes the Effect factory and a tagged provider failure", async () => {
    const client = Effect.runSync(createEventClientEffect(options()));
    expect((await client.publish({ id: "one" })).accepted).toBe(true);
    const failure = new EventWorkFailed({ cause: new Error("failed") });
    expect(failure._tag).toBe("EventWorkFailed");
  });

  test("classifies client callback failures before provider publication", async () => {
    const signalClient = createEventClient({
      ...options(),
      signal: () => {
        throw new Error("signal unavailable");
      },
    });
    await expect(signalClient.publish({ id: "one" })).rejects.toThrow("signal unavailable");
    const deadlineClient = createEventClient({
      ...options(),
      deadline: () => {
        throw new Error("deadline unavailable");
      },
    });
    await expect(deadlineClient.publish({ id: "one" })).rejects.toThrow("deadline unavailable");
    const correlationClient = createEventClient({ ...options(), correlationId: () => " " });
    await expect(correlationClient.publish({ id: "one" })).rejects.toThrow("non-empty text");
    const requestClient = createEventClient(options());
    await expect(
      requestClient.publish({ id: "one" }, { attributes: { invalid: Infinity } }),
    ).rejects.toThrow("finite number");
  });
});
