import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import {
  assertServiceDescriptor,
  assertServiceDescriptorEffect,
  assertServiceMemberName,
  assertServiceMemberNameEffect,
  assertServiceRef,
  assertServiceRefEffect,
  defineService,
  freezeServiceDescriptor,
  freezeServiceDescriptorEffect,
  isFunctionDescriptor,
  isFunctionDescriptorEffect,
  isReservedServiceMemberName,
  isReservedServiceMemberNameEffect,
  isServiceDescriptor,
  isServiceDescriptorEffect,
  isServiceRef,
  isServiceRefEffect,
  normalizeServiceMemberName,
  normalizeServiceMemberNameEffect,
  serviceMemberEntries,
  serviceMemberEntriesEffect,
} from "../src/index.js";

const lookup = defineFunction({
  id: "guards.lookup",
  input: z.object({}),
  output: z.object({}),
  handler: () => ({}),
});

describe("service guards", () => {
  test("normalizes and rejects bad member names in both APIs", () => {
    expect(normalizeServiceMemberName(" lookup ")).toBe("lookup");
    expect(Effect.runSync(normalizeServiceMemberNameEffect("lookup"))).toBe("lookup");
    expect(() => normalizeServiceMemberName(null)).toThrow("must be strings");
    expect(() => normalizeServiceMemberName(" ")).toThrow("non-empty");
    expect(isReservedServiceMemberName(" id ")).toBe(true);
    expect(Effect.runSync(isReservedServiceMemberNameEffect("id"))).toBe(true);
    expect(isReservedServiceMemberName(17)).toBe(false);
    expect(() => assertServiceMemberName(" lookup ")).toThrow("not normalized");
    expect(() => assertServiceMemberName("handler")).toThrow("reserved");
    assertServiceMemberName("lookup");
    expect(Effect.runSync(assertServiceMemberNameEffect("lookup"))).toBe("lookup");
  });

  test("checks service references and returns typed errors", () => {
    const service = defineService({ id: "guards" });
    const wrapper = { ref: service.ref };
    expect(isServiceRef(wrapper)).toBe(true);
    expect(Effect.runSync(isServiceRefEffect(wrapper))).toBe(true);
    expect(isServiceRef({ ref: { kind: "service", id: "bad/id" } })).toBe(false);
    expect(isServiceRef([])).toBe(false);
    assertServiceRef(wrapper);
    expect(Effect.runSync(assertServiceRefEffect(wrapper))).toBe(wrapper);
    expect(() => assertServiceRef({})).toThrow("Invalid service reference");
    expect(Effect.runSync(Effect.flip(assertServiceRefEffect({})))._tag).toBe(
      "ServiceValidationError",
    );
  });

  test("checks function and service descriptor shapes", () => {
    expect(isFunctionDescriptor(lookup)).toBe(true);
    expect(Effect.runSync(isFunctionDescriptorEffect(lookup))).toBe(true);
    expect(isFunctionDescriptor({})).toBe(false);
    expect(isFunctionDescriptor(null)).toBe(false);
    expect(isFunctionDescriptor([])).toBe(false);
    expect(isFunctionDescriptor({ ...lookup, input: {} })).toBe(false);
    expect(isFunctionDescriptor({ ...lookup, input: null })).toBe(false);
    const service = defineService({ id: "guards-shape", functions: { lookup } });
    expect(isServiceDescriptor(service)).toBe(true);
    expect(Effect.runSync(isServiceDescriptorEffect(service))).toBe(true);
    expect(isServiceDescriptor({ ...service, handler: () => {} })).toBe(false);
    expect(isServiceDescriptor({ ...service, rogue: 1 })).toBe(false);
    expect(isServiceDescriptor([])).toBe(false);
    assertServiceDescriptor(service);
    expect(Effect.runSync(assertServiceDescriptorEffect(service))).toBe(service);
    expect(() => assertServiceDescriptor({})).toThrow("Invalid service descriptor");
  });

  test("freezes and lists public members through both APIs", () => {
    const ownLookup = defineFunction({
      id: "guards.members",
      input: z.object({}),
      output: z.object({}),
      handler: () => ({}),
    });
    const service = defineService({ id: "guards-members", functions: { ownLookup } });
    expect(freezeServiceDescriptor(service)).toBe(service);
    expect(Effect.runSync(freezeServiceDescriptorEffect(service))).toBe(service);
    expect(serviceMemberEntries(service)).toEqual([["ownLookup", ownLookup]]);
    expect(Effect.runSync(serviceMemberEntriesEffect(service))).toEqual([["ownLookup", ownLookup]]);
    expect(() => freezeServiceDescriptor({} as never)).toThrow("Invalid service descriptor");
  });
});
