import { describe, expect, test } from "bun:test";
import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { defineFunction } from "@relkit/functions";
import {
  assertServiceDescriptor,
  assertServiceMemberName,
  defineService,
  freezeServiceDescriptor,
  isServiceDescriptor,
  isServiceRef,
} from "./src/index.ts";
import { z } from "@relkit/schema";

const member = defineFunction({
  id: "orders.get",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  handler: async () => ({ ok: true }),
});

function service(functions: Record<string, typeof member>) {
  return freezeServiceDescriptor({
    ...createDescriptorBase("service", "orders"),
    functions,
  });
}

function rawService(functions: Record<string, typeof member>) {
  return {
    ...createDescriptorBase("service", "orders"),
    functions: deepFreeze(functions),
  };
}

describe("service descriptor contracts", () => {
  test("accepts branded frozen services and refs", () => {
    const descriptor = service({ get: member });

    expect(isServiceDescriptor(descriptor)).toBe(true);
    expect(isServiceRef(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.functions)).toBe(true);
    expect(() => assertServiceDescriptor(descriptor)).not.toThrow();
  });

  test("rejects reserved and colliding member names", () => {
    expect(() => assertServiceMemberName("functions")).toThrow("reserved");
    expect(isServiceDescriptor(rawService({ " get ": member, get: member }))).toBe(false);
    expect(isServiceDescriptor(rawService({ functions: member }))).toBe(false);
  });

  test("exposes frozen direct facades without cloning function capabilities", async () => {
    const middleware = Object.freeze({
      ref: Object.freeze({ kind: "service-middleware" as const, id: "orders.auth" }),
    });
    const descriptor = defineService({
      id: "orders",
      functions: { get: member },
      middleware: [middleware],
    });

    expect(descriptor.functions.get).toBe(member);
    expect(descriptor.get).not.toBe(member);
    expect(descriptor.get.input).toBe(member.input);
    expect(descriptor.get.output).toBe(member.output);
    expect(descriptor.get.handler).toBe(member.handler);
    expect(descriptor.get.invoke).toBe(member.invoke);
    expect(descriptor.get.service.ref).toBe(descriptor.ref);
    expect(descriptor.middleware?.[0]).toBe(middleware);
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.get)).toBe(true);
    await expect(descriptor.get.invoke({ id: "1" })).resolves.toEqual({ ok: true });
  });
});
