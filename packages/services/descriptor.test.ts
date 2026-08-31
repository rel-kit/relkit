import { describe, expect, test } from "bun:test";
import { defineEvent } from "@relkit/events";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineService, isServiceDescriptor } from "./src/index.ts";

const lookup = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async (input) => input,
});

const created = defineEvent({
  id: "orders.created",
  version: 1,
  input: z.object({ id: z.string() }),
});

describe("defineService", () => {
  test("preserves public member identity without namespaces", () => {
    const orders = defineService({
      id: "orders",
      functions: { lookup },
      events: { created },
    });

    expect(orders.lookup).toBe(lookup);
    expect(orders.created).toBe(created);
    expect("functions" in orders).toBe(false);
    expect("events" in orders).toBe(false);
    expect(isServiceDescriptor(orders)).toBe(true);
    expect(Object.isFrozen(orders)).toBe(true);
  });

  test("accepts empty and event-only services", () => {
    expect(isServiceDescriptor(defineService({ id: "empty" }))).toBe(true);
    expect(defineService({ id: "events", events: { created } }).created).toBe(created);
  });

  test("rejects invalid and reserved members", () => {
    expect(() => defineService({ id: "bad", functions: { functions: lookup } })).toThrow(
      "reserved",
    );
    expect(() => defineService({ id: "bad", functions: { lookup: {} as typeof lookup } })).toThrow(
      "Invalid service function",
    );
  });
});
