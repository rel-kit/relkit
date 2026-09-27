import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  defineEventFunction,
  defineEventFunctionEffect,
  isEventFunctionDescriptor,
  isEventFunctionDescriptorEffect,
} from "../src/define-event-function.js";
import {
  eventDelivery,
  eventDeliveryEffect,
  eventProfile,
  eventProfileEffect,
  eventRetry,
  eventRetryEffect,
  rejectEventFunctionFields,
  rejectEventFunctionFieldsEffect,
} from "../src/event-function-validation.js";
import { EventDefinitionError } from "../src/event-errors.js";

const consumer = () =>
  defineEventFunction({
    id: "receipt.send",
    event: "orders.created" as never,
    handler: () => {},
  });

describe("event functions", () => {
  test("defines an event-only function with normalized policy", () => {
    const descriptor = consumer();
    expect(descriptor).toMatchObject({
      id: "receipt.send",
      event: "orders.created",
      delivery: "durable",
      profile: "default",
      retry: { maxAttempts: 1, jitter: "none" },
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(isEventFunctionDescriptor(descriptor)).toBe(true);
    expect(Effect.runSync(isEventFunctionDescriptorEffect(descriptor))).toBe(true);
    const defined = Effect.runSync(
      defineEventFunctionEffect({
        id: "receipt.other",
        event: "orders.created" as never,
        delivery: "ephemeral",
        profile: "durable",
        retry: { maxAttempts: 3 },
        handler: () => {},
      }),
    );
    expect(defined.retry.maxAttempts).toBe(3);
    expect(defined.delivery).toBe("ephemeral");
  });

  test.each([
    [null, "must be an object"],
    [
      { id: "receipt", event: "orders.created", handler: () => {}, input: z.unknown() },
      "cannot declare input",
    ],
    [
      { id: "receipt", event: "orders.created", handler: () => {}, output: z.void() },
      "cannot declare output",
    ],
    [
      { id: "receipt", event: "orders.created", handler: () => {}, tool: true },
      "cannot declare tool",
    ],
    [
      { id: "receipt", event: "orders.created", handler: () => {}, trigger: true },
      "cannot declare trigger",
    ],
    [{ id: "receipt", event: "bad event", handler: () => {} }, "Invalid stable ID"],
    [{ id: "bad id", event: "orders.created", handler: () => {} }, "Invalid stable ID"],
    [{ id: "receipt", event: "orders.created" }, "handler must be a function"],
  ])("rejects invalid function definition %#", (options, message) => {
    expect(() => defineEventFunction(options as never)).toThrow(message);
    const failure = Effect.runSync(Effect.flip(defineEventFunctionEffect(options as never)));
    expect(failure).toBeInstanceOf(EventDefinitionError);
    expect(failure.message).toContain(message);
  });

  test("checks descriptor shape and policy", () => {
    const value = consumer();
    for (const candidate of [
      null,
      {},
      { ...value, invocationMode: "callable" },
      { ...value, handler: undefined },
      { ...value, invoke: () => {} },
      { ...value, event: "bad event" },
      { ...value, retry: undefined },
      { ...value, retry: { maxAttempts: 0 } },
      { ...value, delivery: "unknown" },
      { ...value, profile: "bad profile" },
    ]) {
      expect(isEventFunctionDescriptor(candidate)).toBe(false);
      expect(Effect.runSync(isEventFunctionDescriptorEffect(candidate))).toBe(false);
    }
  });

  test("normalizes delivery, profile, and retry through Effect", () => {
    expect(eventDelivery(undefined)).toBe("durable");
    expect(Effect.runSync(eventDeliveryEffect("ephemeral"))).toBe("ephemeral");
    expect(eventProfile(undefined)).toBe("default");
    expect(Effect.runSync(eventProfileEffect("durable"))).toBe("durable");
    expect(eventRetry(undefined).maxAttempts).toBe(1);
    expect(Effect.runSync(eventRetryEffect({ maxAttempts: 4 })).maxAttempts).toBe(4);
    expect(() => rejectEventFunctionFields({ event: "orders.created" })).not.toThrow();
    expect(Effect.runSync(rejectEventFunctionFieldsEffect({}))).toBeUndefined();
  });

  test.each([
    [() => eventDelivery("wrong"), "ephemeral or durable"],
    [() => eventProfile(123), "must be a string"],
    [() => eventProfile("bad profile"), "Invalid stable ID"],
    [() => eventRetry(null), "must be an object"],
    [() => eventRetry({ maxAttempts: 0 }), "positive integer"],
    [() => eventRetry({ initialDelayMs: -1 }), "non-negative integer"],
    [() => eventRetry({ maxDelayMs: -1 }), "non-negative integer"],
    [() => eventRetry({ initialDelayMs: 2 }), "at least"],
    [() => eventRetry({ multiplier: 0 }), "finite number"],
    [() => eventRetry({ jitter: "random" }), "none, full, or equal"],
  ])("rejects invalid policy %#", (operation, message) => {
    expect(operation).toThrow(message);
  });
});
