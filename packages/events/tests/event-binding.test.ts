import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineFunction } from "@relkit/functions";
import { bindDescriptorIdentity, getDescriptorIdentity } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { defineEvent } from "../src/define-event.js";
import { defineEventFunction } from "../src/define-event-function.js";
import { bindFunctionEvents, bindFunctionEventsEffect } from "../src/event-function-target.js";
import { EventBindingError } from "../src/event-errors.js";

const event = defineEvent({ id: "orders.created", input: z.object({ orderId: z.string() }) });
const consumer = () =>
  defineEventFunction({
    id: "receipt.send",
    event: "orders.created" as never,
    handler: () => {},
  });

describe("event contract binding", () => {
  test("binds consumed and published contracts without losing identity", () => {
    const bound = bindFunctionEvents(consumer(), event, []);
    expect(bound.input).toBe(event.input);
    expect(bound.publications).toEqual({});
    expect(Object.isFrozen(bound)).toBe(true);
    const publisher = defineFunction({
      id: "orders.create",
      input: z.unknown(),
      output: z.void(),
      publishes: ["orders.created" as never],
      handler: () => {},
    });
    const withPublication = Effect.runSync(bindFunctionEventsEffect(publisher, undefined, [event]));
    expect(withPublication.publications).toEqual({ "orders.created": event });
  });

  test.each([
    [() => bindFunctionEvents(consumer(), undefined, []), "no matching event contract"],
    [
      () => bindFunctionEvents(consumer(), defineEvent({ id: "other", input: z.unknown() }), []),
      "no matching event contract",
    ],
    [() => bindFunctionEvents(consumer(), event, [event]), "incomplete publication contracts"],
    [
      () => bindFunctionEvents(consumer(), event, [{ ...event, version: 0 }]),
      "Invalid event descriptor",
    ],
    [
      () => bindFunctionEvents(consumer(), { ...event, version: 0 }, []),
      "Invalid event descriptor",
    ],
  ])("rejects invalid binding %#", (operation, message) => {
    expect(operation).toThrow(message);
  });

  test("reports binding failures by tag in the Effect channel", () => {
    const failure = Effect.runSync(
      Effect.flip(bindFunctionEventsEffect(consumer(), undefined, [])),
    );
    expect(failure).toBeInstanceOf(EventBindingError);
    expect(failure._tag).toBe("EventBindingError");
  });

  test("preserves a bound function identity", () => {
    const publisher = defineFunction({
      input: z.unknown(),
      output: z.void(),
      handler: () => {},
    });
    bindDescriptorIdentity(publisher, "orders.create");
    const bound = bindFunctionEvents(publisher, undefined, []);
    expect(getDescriptorIdentity(bound)).toBe("orders.create");
  });

  test("rejects malformed function descriptors and catches binding defects", () => {
    expect(() => bindFunctionEvents({ ...consumer(), handler: undefined }, event, [])).toThrow(
      "Invalid event function",
    );
    const descriptor = new Proxy(
      { id: "orders.create", publishes: [] },
      {
        ownKeys: () => {
          throw new Error("descriptor unavailable");
        },
      },
    );
    const failure = Effect.runSync(
      Effect.flip(bindFunctionEventsEffect(descriptor, undefined, [])),
    );
    expect(failure).toBeInstanceOf(EventBindingError);
    expect(failure.message).toBe("descriptor unavailable");
  });
});
