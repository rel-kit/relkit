import { describe, expect, test } from "bun:test";
import { z } from "@zsys/schema";
import { createObservabilityCollector } from "@zsys/observability";
import {
  createInspectableObservabilityHooks,
  invokeFunction,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./src/index.ts";

describe("versioned invocation observability hooks", () => {
  test("exposes lifecycle events and collector records", async () => {
    const hooks = createInspectableObservabilityHooks();
    await invokeFunction(
      {
        id: "orders.observe",
        input: z.object({ value: z.number() }),
        output: z.object({ value: z.number() }),
        handler: (input) => ({ value: (input as { value: number }).value + 1 }),
      },
      { value: 1 },
      { hooks: { observability: hooks } },
    );

    const events = hooks.read();
    expect(events.map((event) => event.type)).toEqual([
      "invocation.started",
      "span.started",
      "span.completed",
      "invocation.completed",
      "invocation.released",
    ]);
    expect(events.every((event) => event.protocol === OBSERVABILITY_HOOK_PROTOCOL)).toBe(true);
    expect(events.every((event) => event.version === OBSERVABILITY_HOOK_VERSION)).toBe(true);
    expect(events[0]).toMatchObject({ type: "invocation.started", record: { status: "started" } });
    expect(events[3]).toMatchObject({
      type: "invocation.completed",
      completion: { outcome: "success" },
    });
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(hooks.readRecords().map((record) => record.signal)).toEqual([
      "invocation",
      "span",
      "span",
      "invocation",
    ]);
    hooks.clear();
    expect(hooks.read()).toEqual([]);
  });

  test("accepts a collector directly through the existing hook seam", async () => {
    const collector = createObservabilityCollector();
    await invokeFunction(
      {
        id: "orders.collect",
        input: z.number(),
        output: z.number(),
        handler: (value) => value,
      },
      1,
      { hooks: { observability: collector } },
    );
    expect(collector.read().map((record) => record.signal)).toEqual([
      "invocation",
      "span",
      "span",
      "invocation",
    ]);
  });

  test("emits declared and observed dependency edges", async () => {
    const hooks = createInspectableObservabilityHooks();
    const child = {
      id: "orders.child",
      input: z.number(),
      output: z.number(),
      handler: (input: unknown) => (input as number) + 1,
    };
    await invokeFunction(
      {
        id: "orders.parent",
        input: z.number(),
        output: z.number(),
        dependencies: {
          functions: {
            child: {
              ref: { kind: "function", id: child.id },
              input: child.input,
              output: child.output,
            },
          },
        },
        handler: async (_input, _request, context) => {
          const functions = context as typeof context & {
            readonly functions: Readonly<Record<string, (input: unknown) => Promise<unknown>>>;
          };
          return (await functions.functions.child(1)) as number;
        },
      },
      0,
      { clients: { functions: { child } }, hooks: { observability: hooks } },
    );

    expect(hooks.read().map((event) => event.type)).toContain("edge.declared");
    expect(hooks.read().map((event) => event.type)).toContain("edge.observed");
  });
});
