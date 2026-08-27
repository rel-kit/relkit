import { describe, expect, test } from "bun:test";
import { dispatchInvocation } from "@relkit/invocation";
import { defineFunction, defineService } from "@relkit/app";
import { z } from "@relkit/schema";
import { createObservabilityCollector } from "@relkit/observability";
import {
  createInspectableObservabilityHooks,
  invokeFunction,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./src/index.ts";

describe("versioned invocation observability hooks", () => {
  test("attaches service and member identity to invocation and spans", async () => {
    const target = defineFunction({
      id: "orders.get",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    });
    const service = defineService({ id: "orders", functions: { get: target } });
    const collector = createObservabilityCollector();

    await invokeFunction(service.get, {}, { hooks: { observability: collector } });

    expect(collector.read().filter(({ signal }) => signal === "invocation")).toMatchObject([
      { functionId: "orders.get", serviceId: "orders" },
      { functionId: "orders.get", serviceId: "orders" },
    ]);
    expect(collector.read().filter(({ signal }) => signal === "span")).toMatchObject([
      { functionId: "orders.get", serviceId: "orders" },
      { functionId: "orders.get", serviceId: "orders" },
    ]);
  });

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

  test("emits observed descriptor edges without declared function edges", async () => {
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
        handler: async () => {
          return (await dispatchInvocation({ target: child, input: 1 })) as number;
        },
      },
      0,
      { hooks: { observability: hooks } },
    );

    expect(hooks.read().map((event) => event.type)).not.toContain("edge.declared");
    expect(hooks.read().map((event) => event.type)).toContain("edge.observed");
  });

  test("observes calls between sibling service members with correlated records", async () => {
    const hooks = createInspectableObservabilityHooks();
    const child = defineFunction({
      id: "orders.product",
      input: z.object({}),
      output: z.object({ sku: z.string() }),
      handler: () => ({ sku: "sku-1" }),
    });
    const parent = defineFunction({
      id: "orders.get",
      input: z.object({}),
      output: z.object({ sku: z.string() }),
      handler: () => service.product.invoke({}),
    });
    const service = defineService({ id: "orders", functions: { get: parent, product: child } });

    await expect(
      invokeFunction(service.get, {}, { hooks: { observability: hooks } }),
    ).resolves.toEqual({ sku: "sku-1" });

    const starts = hooks.read().filter((event) => event.type === "invocation.started");
    const parentStart = starts.find((event) => event.record.functionId === "orders.get")?.record;
    const childStart = starts.find((event) => event.record.functionId === "orders.product")?.record;
    expect(parentStart).toMatchObject({ serviceId: "orders" });
    expect(childStart).toMatchObject({
      serviceId: "orders",
      parentId: parentStart?.id,
      traceId: parentStart?.traceId,
    });
    expect(hooks.read()).toContainEqual(
      expect.objectContaining({
        type: "edge.observed",
        edge: { relationship: "calls-function", from: "orders.get", to: "orders.product" },
      }),
    );
  });
});
