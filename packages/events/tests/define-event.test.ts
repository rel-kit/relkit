import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  assertEventDescriptor,
  assertEventDescriptorEffect,
  defineEvent,
  defineEventEffect,
  isEventDescriptor,
  isEventDescriptorEffect,
} from "../src/define-event.js";
import { EventDefinitionError } from "../src/event-errors.js";

const input = z.object({ orderId: z.string() });

describe("event contracts", () => {
  test("defines immutable versioned contracts with normalized sensitive fields", () => {
    const event = defineEvent({
      id: "orders.created",
      version: 2,
      input,
      profile: "durable",
      sensitiveFields: [" orderId "],
    });
    expect(event).toMatchObject({
      id: "orders.created",
      version: 2,
      profile: "durable",
      sensitiveFields: ["orderId"],
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.sensitiveFields)).toBe(true);
    expect(isEventDescriptor(event)).toBe(true);
    expect(Effect.runSync(isEventDescriptorEffect(event))).toBe(true);
    expect(Effect.runSync(assertEventDescriptorEffect(event))).toBe(event);
    expect(() => assertEventDescriptor(event)).not.toThrow();
  });

  test("uses version one and omits optional fields", () => {
    const event = Effect.runSync(defineEventEffect({ id: "orders.created", input }));
    expect(event.version).toBe(1);
    expect(event).not.toHaveProperty("profile");
    expect(event).not.toHaveProperty("sensitiveFields");
  });

  test.each([
    [null, "Event options must be an object"],
    [{ id: "orders.created", input, handler: () => {} }, "Events cannot own handlers"],
    [{ id: "orders.created", input, output: input }, "Events cannot own outputs"],
    [{ id: "orders.created", input: {} }, "Standard Schema"],
    [{ id: "orders.created", input, version: 0 }, "positive integer"],
    [{ id: "orders.created", input, version: 1.5 }, "positive integer"],
    [{ id: "orders.created", input, profile: "invalid profile" }, "Invalid stable ID"],
    [{ id: "orders.created", input, sensitiveFields: "id" }, "must be an array"],
    [{ id: "orders.created", input, sensitiveFields: [""] }, "non-empty strings"],
    [{ id: "orders.created", input, sensitiveFields: ["id", " id "] }, "unique"],
  ])("rejects invalid contract %#", (options, message) => {
    expect(() => defineEvent(options as never)).toThrow(message);
    const exit = Effect.runSync(Effect.flip(defineEventEffect(options as never)));
    expect(exit).toBeInstanceOf(EventDefinitionError);
    expect(exit.message).toContain(message);
  });

  test("guards invalid descriptors and asserts with a typed Effect error", () => {
    const event = defineEvent({ id: "orders.created", input });
    for (const candidate of [
      null,
      {},
      { ...event, version: 0 },
      { ...event, input: {} },
      { ...event, profile: "bad profile" },
      { ...event, handler: () => {} },
      { ...event, output: input },
    ]) {
      expect(isEventDescriptor(candidate)).toBe(false);
      expect(() => assertEventDescriptor(candidate)).toThrow("Invalid event descriptor");
      expect(Effect.runSync(Effect.flip(assertEventDescriptorEffect(candidate)))).toBeInstanceOf(
        EventDefinitionError,
      );
    }
  });
});
