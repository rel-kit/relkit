import { defineFunction, defineService } from "@relkit/app";
import { dispatchInvocation } from "@relkit/invocation";
import { createObservabilityCollector } from "@relkit/observability";
import { z } from "@relkit/schema";
import { describe, expect, test } from "vitest";
import {
  createInspectableObservabilityHooks,
  invokeFunction,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "../src/index.js";
import { invocationTarget } from "./fixtures.js";

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

    await invokeFunction(
      invocationTarget(service.get),
      {},
      { hooks: { observability: collector } },
    );

    expect(collector.read().filter(({ signal }) => signal === "invocation")).toMatchObject([
      { functionId: "orders.get", serviceId: "orders" },
      { functionId: "orders.get", serviceId: "orders" },
    ]);
    expect(
      collector
        .read()
        .filter(
          (record) =>
            record.signal === "span" &&
            record.name === "relkit.invoke.orders.get" &&
            record.status !== "updated",
        ),
    ).toMatchObject([
      { functionId: "orders.get", serviceId: "orders" },
      { functionId: "orders.get", serviceId: "orders" },
    ]);
  });

  test("exposes lifecycle events and collector records", async () => {
    const hooks = createInspectableObservabilityHooks();
    await invokeFunction(
      invocationTarget({
        id: "orders.observe",
        input: z.object({ value: z.number() }),
        output: z.object({ value: z.number() }),
        handler: (input: unknown) => ({ value: (input as { value: number }).value + 1 }),
      }),
      { value: 1 },
      { hooks: { observability: hooks } },
    );

    const events = hooks.read();
    expect(
      events.filter((event) => !event.type.startsWith("span.")).map((event) => event.type),
    ).toEqual(["invocation.started", "invocation.completed", "invocation.released"]);
    expect(events.every((event) => event.protocol === OBSERVABILITY_HOOK_PROTOCOL)).toBe(true);
    expect(events.every((event) => event.version === OBSERVABILITY_HOOK_VERSION)).toBe(true);
    expect(events[0]).toMatchObject({ type: "invocation.started", record: { status: "started" } });
    expect(events.find((event) => event.type === "invocation.completed")).toMatchObject({
      type: "invocation.completed",
      completion: { outcome: "success" },
    });
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(
      hooks
        .readRecords()
        .filter((record) => record.signal === "invocation")
        .map((record) => record.signal),
    ).toEqual(["invocation", "invocation"]);
    hooks.clear();
    expect(hooks.read()).toEqual([]);
  });

  test("accepts a collector directly through the existing hook seam", async () => {
    const collector = createObservabilityCollector();
    await invokeFunction(
      invocationTarget({
        id: "orders.collect",
        input: z.number(),
        output: z.number(),
        handler: (value: unknown) => value,
      }),
      1,
      { hooks: { observability: collector } },
    );
    expect(
      collector
        .read()
        .filter((record) => record.signal === "invocation")
        .map((record) => record.signal),
    ).toEqual(["invocation", "invocation"]);
  });

  test("captures redacted invocation input and output only when configured", async () => {
    const collector = createObservabilityCollector({
      redaction: { mode: "development-redacted", maxBytes: 512 },
    });
    await invokeFunction(
      invocationTarget({
        id: "orders.capture",
        input: z.object({ password: z.string(), value: z.number() }),
        output: z.object({ ok: z.boolean(), token: z.string() }),
        handler: () => ({ ok: true, token: "secret-result" }),
      }),
      { password: "secret-input", value: 1 },
      { hooks: { observability: collector } },
    );
    const span = collector
      .read()
      .find(
        (record) =>
          record.signal === "span" &&
          record.status === "completed" &&
          record.name === "relkit.invoke.orders.capture",
      );
    expect(span).toMatchObject({
      inputCapture: {
        content: { password: "[REDACTED]", value: 1 },
        truncated: false,
      },
      outputCapture: {
        content: { ok: true, token: "[REDACTED]" },
        truncated: false,
      },
    });
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
      invocationTarget({
        id: "orders.parent",
        input: z.number(),
        output: z.number(),
        handler: async () => {
          return (await dispatchInvocation({ target: child, input: 1 })) as number;
        },
      }),
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
      handler: (): Promise<{ sku: string }> => service.product.invoke({}),
    });
    const service = defineService({ id: "orders", functions: { get: parent, product: child } });

    await expect(
      invokeFunction(invocationTarget(service.get), {}, { hooks: { observability: hooks } }),
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
