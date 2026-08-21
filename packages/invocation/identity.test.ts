import { describe, expect, test } from "bun:test";
import {
  bindDescriptorIdentity,
  createUnboundIdentity,
  getDescriptorIdentity,
  isDescriptorIdentityBound,
  resolveDescriptorIdentity,
} from "./src/index.ts";

describe("descriptor identity binding", () => {
  test("binds a canonical ID without mutating the descriptor", () => {
    const descriptor = Object.freeze({ id: createUnboundIdentity() });
    const before = descriptor.id;

    expect(bindDescriptorIdentity(descriptor, "orders.get-order")).toBe(descriptor);
    expect(getDescriptorIdentity(descriptor)).toBe("orders.get-order");
    expect(resolveDescriptorIdentity(descriptor)).toMatchObject({
      id: "orders.get-order",
      canonical: true,
      key: "orders.get-order",
    });
    expect(descriptor.id).toBe(before);
    expect(isDescriptorIdentityBound(descriptor)).toBe(true);
  });

  test("keeps unbound identities process-local and object-scoped", () => {
    const first = {};
    const second = {};
    const firstIdentity = resolveDescriptorIdentity(first);
    const again = resolveDescriptorIdentity(first);
    const secondIdentity = resolveDescriptorIdentity(second);

    expect(firstIdentity.canonical).toBe(false);
    expect(firstIdentity.id).toMatch(/^unbound\./);
    expect(firstIdentity.id).toBe(again.id);
    expect(firstIdentity.id).not.toBe(secondIdentity.id);
    expect(firstIdentity.key).toBe(first);
  });
});
