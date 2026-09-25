import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  assertDescriptor,
  assertDescriptorEffect,
  assertRef,
  assertRefEffect,
  createDescriptorBase,
  createDescriptorBaseEffect,
  createRef,
  createRefEffect,
  deepFreeze,
  deepFreezeEffect,
  DescriptorError,
  DescriptorReferenceError,
  isDescriptor,
  isDescriptorEffect,
  isDescriptorKind,
  isDescriptorKindEffect,
  isRef,
  isRefEffect,
  RELKIT_DESCRIPTOR,
  StableIdError,
} from "../src/index.js";

describe("descriptor identity and immutability", () => {
  test("creates exact frozen references through both APIs", () => {
    const ref = createRef("route", " orders.get ");
    expect(ref).toEqual({ kind: "route", id: "orders.get" });
    expect(Object.isFrozen(ref)).toBe(true);
    expect(Effect.runSync(createRefEffect("route", "orders.get"))).toEqual(ref);
    expect(() => createRef("route", "bad/id")).toThrow(StableIdError);
    expect(Effect.runSync(Effect.flip(createRefEffect("route", "bad/id")))).toBeInstanceOf(
      StableIdError,
    );
  });

  test("validates kinds and exact reference shapes", () => {
    const ref = createRef("route", "orders.get");
    expect(isDescriptorKind("route")).toBe(true);
    expect(Effect.runSync(isDescriptorKindEffect("unknown"))).toBe(false);
    expect(isRef(ref, "route")).toBe(true);
    expect(Effect.runSync(isRefEffect(ref, "service"))).toBe(false);
    expect(() => assertRef(ref, "route")).not.toThrow();
    expect(Effect.runSync(assertRefEffect(ref))).toBeUndefined();
    for (const invalid of [
      null,
      {},
      { ...ref, extra: true },
      { kind: "unknown", id: "orders.get" },
      { kind: "route", id: "bad/id" },
    ]) {
      expect(isRef(invalid)).toBe(false);
      expect(() => assertRef(invalid)).toThrow("Invalid RelKit descriptor reference");
      const error = Effect.runSync(Effect.flip(assertRefEffect(invalid)));
      expect(error).toBeInstanceOf(DescriptorReferenceError);
      expect(error._tag).toBe("DescriptorReferenceError");
    }
  });

  test("brands and freezes descriptors with copied metadata", () => {
    const tags = ["orders"];
    const descriptor = createDescriptorBase("route", "orders.get", {
      title: "Get order",
      description: "Fetches one order",
      tags,
    });
    tags.push("later");
    expect(descriptor.tags).toEqual(["orders"]);
    expect(Object.isFrozen(descriptor.tags)).toBe(true);
    expect(Object.isFrozen(descriptor.ref)).toBe(true);
    expect(descriptor[RELKIT_DESCRIPTOR]).toBe(true);
    expect(Effect.runSync(createDescriptorBaseEffect("route", "orders.get"))).toMatchObject({
      kind: "route",
      id: "orders.get",
    });
    expect(() => assertDescriptor(descriptor)).not.toThrow();
    expect(Effect.runSync(assertDescriptorEffect(descriptor))).toBeUndefined();
  });

  test("rejects forged or inconsistent descriptor identities", () => {
    const descriptor = createDescriptorBase("route", "orders.get");
    for (const invalid of [
      { [RELKIT_DESCRIPTOR]: true },
      { ...descriptor, [RELKIT_DESCRIPTOR]: false },
      { ...descriptor, kind: "unknown" },
      { ...descriptor, id: "bad/id" },
      { ...descriptor, ref: { kind: "route", id: "bad/id" } },
      { ...descriptor, id: "orders.other" },
      { ...descriptor, ref: { kind: "service", id: "orders.get" } },
    ]) {
      expect(isDescriptor(invalid, "route")).toBe(false);
      expect(Effect.runSync(isDescriptorEffect(invalid, "route"))).toBe(false);
      expect(() => assertDescriptor(invalid)).toThrow("Invalid RelKit descriptor");
      const error = Effect.runSync(Effect.flip(assertDescriptorEffect(invalid)));
      expect(error).toBeInstanceOf(DescriptorError);
      expect(error._tag).toBe("DescriptorError");
    }
    expect(isDescriptor(descriptor, "service")).toBe(false);
  });

  test("deep freezes cycles without invoking accessors", () => {
    const value: { nested: { count: number }; self?: unknown } = { nested: { count: 1 } };
    value.self = value;
    Object.defineProperty(value, "unsafe", {
      get: () => {
        throw new Error("accessor should not run");
      },
    });
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Effect.runSync(deepFreezeEffect(value))).toBe(value);
  });
});
