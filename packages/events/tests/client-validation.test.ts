import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  assertOptionalText,
  assertOptionalTextEffect,
  assertVersion,
  assertVersionEffect,
  normalizeAttributesEffect,
  normalizeOptions,
  normalizeOptionsEffect,
  parsePayload,
  parsePayloadEffect,
} from "../src/client-validation.js";
import { EventIdentity, normalizeResult, normalizeResultEffect } from "../src/client-result.js";
import {
  EventClientValidationError,
  EventPayloadValidationError,
  EventPayloadValidationFailure,
} from "../src/client-errors.js";

const context = {
  operation: "publish" as const,
  eventId: "orders.created",
  version: 1,
  signal: new AbortController().signal,
  profile: "default",
};

describe("client validation and metadata", () => {
  test("decodes payloads and keeps undefined schemas transparent", async () => {
    const schema = z.object({ id: z.string() });
    expect(await Effect.runPromise(parsePayloadEffect(schema, { id: "one" }))).toEqual({
      id: "one",
    });
    expect(await parsePayload(schema, { id: "two" })).toEqual({ id: "two" });
    expect(await Effect.runPromise(parsePayloadEffect(undefined, 42))).toBe(42);
    const failure = await Effect.runPromise(Effect.flip(parsePayloadEffect(schema, { id: 2 })));
    expect(failure).toBeInstanceOf(EventPayloadValidationFailure);
    expect(failure.issues.length).toBeGreaterThan(0);
    await expect(parsePayload(schema, { id: 2 })).rejects.toBeInstanceOf(TypeError);
  });

  test("classifies rejecting Standard Schema validators", async () => {
    const rejecting = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => Promise.reject(new Error("validator offline")),
      },
    };
    const failure = await Effect.runPromise(
      Effect.flip(parsePayloadEffect(rejecting as never, {})),
    );
    expect(failure).toBeInstanceOf(EventClientValidationError);
    expect(failure.message).toBe("validator offline");
  });

  test("sorts and freezes valid options and attributes", () => {
    const value = normalizeOptions({ key: "order-1", attributes: { z: true, a: 2, b: "ok" } });
    expect(value).toEqual({ key: "order-1", attributes: { a: 2, b: "ok", z: true } });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.attributes)).toBe(true);
    expect(Effect.runSync(normalizeOptionsEffect({}))).toEqual({});
    expect(Effect.runSync(normalizeAttributesEffect({ ok: false }))).toEqual({ ok: false });
  });

  test.each([
    [null, "must be an object"],
    [{ key: " " }, "non-empty text"],
    [{ attributes: [] }, "attributes must be an object"],
    [{ attributes: { number: Infinity } }, "finite number"],
    [{ attributes: { nested: {} } }, "finite number"],
  ])("rejects invalid options %#", (value, message) => {
    expect(() => normalizeOptions(value)).toThrow(message);
    const failure = Effect.runSync(Effect.flip(normalizeOptionsEffect(value)));
    expect(failure).toBeInstanceOf(EventClientValidationError);
  });

  test("validates optional text and positive versions in both APIs", () => {
    expect(Effect.runSync(assertOptionalTextEffect(undefined, "key"))).toBeUndefined();
    expect(() => assertOptionalText(" ", "key")).toThrow("non-empty text");
    expect(Effect.runSync(assertVersionEffect(2))).toBe(2);
    expect(() => assertVersion(0)).toThrow("positive integer");
    expect(() => assertVersion(1.5)).toThrow("positive integer");
    assertVersion(1);
  });

  test("uses accepted provider metadata and fallback values", () => {
    const result = normalizeResult(
      {
        accepted: true,
        instanceId: "event-2",
        occurredAt: "one",
        publishedAt: "two",
        key: "provider",
        attributes: { b: 2, a: 1 },
      },
      { id: "one" },
      { key: "request" },
      context,
      () => new Date(1000),
      "orders.created",
      1,
    );
    expect(result).toMatchObject({
      instanceId: "event-2",
      occurredAt: "one",
      publishedAt: "two",
      key: "provider",
      attributes: { a: 1, b: 2 },
    });
    expect(Object.isFrozen(result)).toBe(true);
    const fallback = Effect.runSync(
      normalizeResultEffect(undefined, 2, {}, context, () => new Date(1000), "orders.created", 1),
    );
    expect(fallback.instanceId).toMatch(/^event-/);
    expect(fallback.occurredAt).toBe(new Date(1000).toISOString());
  });

  test("substitutes time and IDs with a deterministic Layer", () => {
    const identity = Layer.succeed(
      EventIdentity,
      EventIdentity.of({
        now: () => new Date(2000),
        nextId: () => "event-layer",
      }),
    );
    const result = Effect.runSync(
      normalizeResultEffect(undefined, 2, {}, context, undefined, "orders.created", 1).pipe(
        Effect.provide(identity),
      ),
    );
    expect(result.instanceId).toBe("event-layer");
    expect(result.occurredAt).toBe(new Date(2000).toISOString());
    const failing = Layer.succeed(
      EventIdentity,
      EventIdentity.of({
        now: () => new Date(2000),
        nextId: () => {
          throw new Error("ID exhausted");
        },
      }),
    );
    const failure = Effect.runSync(
      Effect.flip(
        normalizeResultEffect(undefined, 2, {}, context, undefined, "orders.created", 1).pipe(
          Effect.provide(failing),
        ),
      ),
    );
    expect(failure).toBeInstanceOf(EventClientValidationError);
    expect(failure.message).toBe("ID exhausted");
  });

  test("reports malformed provider result metadata", () => {
    const failure = Effect.runSync(
      Effect.flip(
        normalizeResultEffect(
          {
            accepted: true,
            instanceId: "one",
            attributes: { invalid: Infinity },
          },
          1,
          {},
          context,
          undefined,
          "orders.created",
          1,
        ),
      ),
    );
    expect(failure).toBeInstanceOf(EventClientValidationError);
    expect(() =>
      normalizeResult(undefined, 1, {}, context, () => new Date(NaN), "orders.created", 1),
    ).toThrow();
  });
});
