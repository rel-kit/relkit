import { describe, expect, test } from "bun:test";
import {
  ZSYS_DESCRIPTOR,
  assertDescriptor,
  assertRef,
  createDescriptorBase,
  createRef,
  deepFreeze,
  isDescriptor,
  isRef,
} from "../../packages/contracts/src/index.ts";

describe("descriptor contracts", () => {
  test("uses the global brand and normalized immutable refs", () => {
    const descriptor = createDescriptorBase("function", " orders.create ", {
      title: "Create order",
      tags: ["orders", "write"],
    });

    expect(ZSYS_DESCRIPTOR).toBe(Symbol.for("zsys.descriptor"));
    expect(descriptor.id).toBe("orders.create");
    expect(descriptor.ref).toEqual({ kind: "function", id: "orders.create" });
    expect(isDescriptor(descriptor)).toBe(true);
    expect(isRef(descriptor.ref)).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.ref)).toBe(true);
    expect(Object.isFrozen(descriptor.tags)).toBe(true);
    assertDescriptor(descriptor);
    assertRef(descriptor.ref);
  });

  test("rejects forged or mismatched values and freezes nested cycles", () => {
    const nested: { child?: unknown } = {};
    nested.child = nested;
    const value = deepFreeze({ nested });

    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(isRef({ kind: "function", id: "bad id" })).toBe(false);
    expect(
      isDescriptor({
        [ZSYS_DESCRIPTOR]: true,
        kind: "function",
        id: "orders.create",
        ref: createRef("route", "orders.create"),
      }),
    ).toBe(false);
    expect(() => assertDescriptor({})).toThrow("Invalid ZSys descriptor");
  });
});
