import { describe, expect, test } from "bun:test";
import type { ProtocolId } from "@relkit/contracts";
import { defineFunction, defineService, defineServiceMiddleware } from "@relkit/app";
import { z } from "@relkit/schema";
import { invokeFunction } from "./src/index.ts";

function ids() {
  let next = 0;
  return { next: (kind: "trace" | "invocation" | "span") => `${kind}-${++next}` as ProtocolId };
}

describe("service policy materialization", () => {
  test("runs after admission and unwinds after a successful function lifecycle", async () => {
    const events: string[] = [];
    const middleware = defineServiceMiddleware({
      id: "orders.context",
      handler: async ({ context }, next) => {
        events.push(`before:${context.invocation.source}`);
        await next({ tenant: "acme" });
        events.push("after");
      },
    });
    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({ value: z.number() }),
      output: z.object({ value: z.number() }),
      handler: (input, context) => {
        events.push(`handler:${context.service.tenant}`);
        return (input as { value: number }).value === 9
          ? { value: "invalid" }
          : { value: (input as { value: number }).value + 1 };
      },
    });
    const service = defineService({
      id: "orders",
      functions: { lookup: target },
      middleware: [middleware],
    });

    for (const source of ["http", "direct", "job", "event", "tool", "agent"] as const) {
      const before = events.length;
      await invokeFunction(
        service.lookup,
        { value: 1 },
        {
          source,
          idSource: ids(),
          admit: () => {
            events.push(`admit:${source}`);
            return { release: () => undefined };
          },
        },
      );
      expect(events.slice(before)).toEqual([
        `admit:${source}`,
        `before:${source}`,
        "handler:acme",
        "after",
      ]);
    }

    const serviceTool = service.lookup.asTool({
      id: "orders.lookup-tool",
      description: "Look up an order",
      sideEffect: "read",
      approval: "never",
    });
    await serviceTool.invoke({ value: 1 });
    expect(events.slice(-3)).toEqual(["before:tool", "handler:acme", "after"]);
    await service.lookup.invoke({ value: 1 });
    expect(events.slice(-3)).toEqual(["before:direct", "handler:acme", "after"]);

    const beforeInvalid = events.length;
    await expect(
      invokeFunction(
        service.lookup,
        { value: "bad" },
        {
          source: "direct",
          idSource: ids(),
          admit: () => {
            throw new Error("must not admit");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "RELKIT_INPUT_VALIDATION" });
    expect(events).toHaveLength(beforeInvalid);

    await expect(
      invokeFunction(service.lookup, { value: 9 }, { source: "direct", idSource: ids() }),
    ).rejects.toMatchObject({ kind: "defect" });
    expect(events.slice(-2)).toEqual(["before:direct", "handler:acme"]);
  });

  test("resolves policy from the compiled service map for a root target", async () => {
    const seen: string[] = [];
    const middleware = defineServiceMiddleware({
      id: "orders.context",
      handler: async (_invocation, next) => {
        seen.push("middleware");
        await next();
      },
    });
    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: () => {
        seen.push("handler");
        return { ok: true };
      },
    });
    const service = defineService({
      id: "orders",
      functions: { lookup: target },
      middleware: [middleware],
    });

    await invokeFunction(target, {}, { servicePolicies: { orders: service } });
    expect(seen).toEqual(["middleware", "handler"]);
  });
});
