/** Checks that calls made through the runtime handle are traced as `system` calls. */
import { defineFunction } from "../../src/app/index.js";
import { z } from "../../src/schema/index.js";
import { defineService } from "../../src/services/index.js";
import { expect, test } from "vitest";
import {
  createInspectableObservabilityHooks,
  createRuntimeHandle,
  invokeFunction,
  type InvocationTarget,
} from "../../src/engine/index.js";

test("runtime-handle calls carry the system source on their invocation and span", async () => {
  const priceOrder = defineFunction({
    id: "orders.price-order",
    input: z.object({ quantity: z.number() }),
    output: z.object({ totalCents: z.number() }),
    handler: async ({ quantity }, context) => {
      expect(context.invocation.source).toBe("system");
      return { totalCents: quantity * 100 };
    },
  });
  const hooks = createInspectableObservabilityHooks();
  const spans: { readonly attributes?: Readonly<Record<string, unknown>> }[] = [];
  const relkit = createRuntimeHandle({
    services: { orders: defineService({ functions: { priceOrder } }) },
    invoke: (_functionId, input) =>
      invokeFunction(priceOrder as unknown as InvocationTarget, input, {
        source: "system",
        hooks: { observability: hooks, onSpanStart: (span) => void spans.push(span) },
      }),
  });

  const handle = relkit as unknown as {
    readonly functions: Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
  };
  await expect(handle.functions.orders!.priceOrder!({ quantity: 2 })).resolves.toEqual({
    totalCents: 200,
  });

  const started = hooks.read().find((event) => event.type === "invocation.started");
  expect(started?.record).toMatchObject({ functionId: "orders.price-order", source: "system" });
  expect(JSON.stringify(spans)).toContain("system");
});
