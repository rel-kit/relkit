import { expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import { EventPublisher, publishEventEffect } from "../src/client-publish.js";
import { EventWorkFailed } from "../src/client-operation.js";

const schema = z.object({ id: z.string() });
const options = () => ({
  ownerId: "orders.create",
  eventId: "orders.created",
  version: 1 as const,
  payloadSchema: schema,
  source: {},
  now: () => new Date(1000),
});
const response = { accepted: true as const, instanceId: "event-1" };

test("classifies an unknown bridge rejection as a tagged work failure", async () => {
  const setup = {
    options: { ...options(), bridge: { run: () => Promise.reject("bridge offline") } },
    ownerId: "orders.create",
    eventId: "orders.created",
    version: 1 as const,
    profile: "default",
    declared: true,
  };
  const layer = Layer.succeed(
    EventPublisher,
    EventPublisher.of({
      publish: () => Effect.succeed(response),
    }),
  );
  const failure = await Effect.runPromise(
    Effect.flip(publishEventEffect(setup, { id: "one" }).pipe(Effect.provide(layer))),
  );
  expect(failure).toBeInstanceOf(EventWorkFailed);
  expect(failure.cause).toBe("bridge offline");
});
