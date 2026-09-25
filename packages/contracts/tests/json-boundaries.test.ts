import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  assertJsonValue,
  assertJsonValueEffect,
  isJsonPrimitive,
  isJsonPrimitiveEffect,
  isJsonValue,
  isJsonValueEffect,
  JsonValueError,
  serializeJson,
  serializeJsonEffect,
} from "../src/index.js";
describe("JSON boundary", () => {
  test("accepts finite primitives and preserves array order", () => {
    for (const value of [null, "text", true, false, 0, Number.MIN_VALUE]) {
      expect(isJsonPrimitive(value)).toBe(true);
      expect(Effect.runSync(isJsonPrimitiveEffect(value))).toBe(true);
    }
    for (const value of [undefined, NaN, Infinity, 1n, {}]) {
      expect(isJsonPrimitive(value)).toBe(false);
      expect(Effect.runSync(isJsonPrimitiveEffect(value))).toBe(false);
    }
    const value = { z: { b: 2, a: 1 }, a: ["second", "first"] };
    const json = '{"a":["second","first"],"z":{"a":1,"b":2}}';
    expect(serializeJson(value)).toBe(json);
    expect(Effect.runSync(serializeJsonEffect(value))).toBe(json);
    expect(isJsonValue(value)).toBe(true);
    expect(Effect.runSync(isJsonValueEffect(value))).toBe(true);
    expect(() => assertJsonValue(value)).not.toThrow();
    expect(Effect.runSync(assertJsonValueEffect(value))).toBeUndefined();
  });
  test("rejects unsupported scalar and object values with typed paths", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const invalid: Array<[unknown, string]> = [
      [undefined, "undefined is not JSON data"],
      [() => 1, "functions are not JSON data"],
      [Symbol("value"), "symbols are not JSON data"],
      [1n, "bigints are not JSON data"],
      [NaN, "non-finite numbers are not JSON data"],
      [Infinity, "non-finite numbers are not JSON data"],
      [new Date(0), "only arrays and plain objects are JSON data"],
      [new Map(), "only arrays and plain objects are JSON data"],
      [cycle, "cycles are not JSON data"],
    ];
    for (const [value, message] of invalid) {
      expect(isJsonValue(value)).toBe(false);
      expect(Effect.runSync(isJsonValueEffect(value))).toBe(false);
      expect(() => serializeJson(value)).toThrow(message);
      expect(() => assertJsonValue(value)).toThrow(JsonValueError);
      expect(Effect.runSync(Effect.flip(serializeJsonEffect(value)))).toBeInstanceOf(
        JsonValueError,
      );
    }
    expect(() => serializeJson({ nested: { invalid: undefined } })).toThrow(
      'Invalid JSON value at $["nested"]["invalid"]: undefined is not JSON data',
    );
  });
  test("reports the first invalid value in canonical traversal order", () => {
    const recordError = Effect.runSync(Effect.flip(serializeJsonEffect({ z: undefined, a: NaN })));
    expect(recordError.path).toBe('$["a"]');
    const arrayError = Effect.runSync(Effect.flip(serializeJsonEffect([NaN, undefined])));
    expect(arrayError.path).toBe("$[0]");
  });
  test("rejects array holes, accessors, extra properties, and symbol keys", () => {
    const sparse = Array(1);
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", { enumerable: true, get: () => 1 });
    const accessorObject = {};
    Object.defineProperty(accessorObject, "bad", { enumerable: true, get: () => 1 });
    const extraArray = [1];
    Object.defineProperty(extraArray, "extra", { enumerable: true, value: 2 });
    class ArraySubclass extends Array<number> {}
    const symbolObject = { [Symbol("bad")]: 1 };
    const invalid: Array<[unknown, string]> = [
      [sparse, "sparse arrays are not JSON data"],
      [accessorArray, "accessor properties are not JSON data"],
      [accessorObject, "accessor properties are not JSON data"],
      [extraArray, "array properties are not JSON data"],
      [new ArraySubclass(1), "only ordinary arrays are JSON data"],
      [symbolObject, "symbol keys are not JSON data"],
    ];
    for (const [value, reason] of invalid) {
      expect(() => serializeJson(value)).toThrow(reason);
    }
  });
  test("keeps unexpected proxy failures as defects", () => {
    const broken = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("proxy failure");
        },
      },
    );
    expect(() => Effect.runSync(Effect.flip(serializeJsonEffect(broken)))).toThrow("proxy failure");
  });
});
