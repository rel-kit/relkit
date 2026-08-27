import { describe, expect, test } from "bun:test";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import {
  defineService,
  defineServiceMiddleware,
  isServiceMiddlewareDescriptor,
} from "./src/index.ts";

const invocation = {
  input: { orderId: "order-1" },
  context: {} as never,
};

describe("service middleware", () => {
  test("runs around next with a frozen per-invocation patch", async () => {
    const cleanup: string[] = [];
    const patches: unknown[] = [];
    const middleware = defineServiceMiddleware({
      id: "orders.context",
      handler: async ({ input, context }, next) => {
        expect(input).toEqual({ orderId: "order-1" });
        expect(context).toBe(invocation.context);
        try {
          await next({ actorId: "actor-1", nested: { role: "admin" } });
        } finally {
          cleanup.push("after");
        }
      },
    });

    const downstream = async (patch?: Readonly<Record<string, unknown>>): Promise<void> => {
      expect(patch).toBeDefined();
      expect(Object.isFrozen(patch)).toBe(true);
      expect(Object.isFrozen(patch?.nested)).toBe(true);
      patches.push(patch);
    };

    expect(isServiceMiddlewareDescriptor(middleware)).toBe(true);
    expect(Object.isFrozen(middleware)).toBe(true);
    await middleware.handler(invocation, downstream);
    await middleware.handler(invocation, downstream);

    expect(cleanup).toEqual(["after", "after"]);
    expect(patches).toHaveLength(2);
    expect(patches[0]).not.toBe(patches[1]);
  });

  test("normalizes missing and duplicate continuation defects", async () => {
    const missing = defineServiceMiddleware({
      id: "orders.missing",
      handler: async () => undefined,
    });
    await expect(missing.handler(invocation, async () => undefined)).rejects.toMatchObject({
      code: "RELKIT_SERVICE_MIDDLEWARE_POLICY",
    });

    const duplicate = defineServiceMiddleware({
      id: "orders.duplicate",
      handler: async (_invocation, next) => {
        await next();
        await next();
      },
    });
    await expect(duplicate.handler(invocation, async () => undefined)).rejects.toMatchObject({
      code: "RELKIT_SERVICE_MIDDLEWARE_POLICY",
    });
  });

  test("blocks a continuation scheduled after middleware returns", async () => {
    let executions = 0;
    const middleware = defineServiceMiddleware({
      id: "orders.late",
      handler: (_invocation, next) => {
        setTimeout(() => void next(), 0);
      },
    });

    await expect(
      middleware.handler(invocation, async () => {
        executions += 1;
      }),
    ).rejects.toMatchObject({ code: "RELKIT_SERVICE_MIDDLEWARE_POLICY" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(executions).toBe(0);
  });

  test("normalizes declared policy rejections", async () => {
    const denied = defineError({
      id: "orders.denied",
      data: z.object({ reason: z.string() }),
      message: ({ reason }) => reason,
      retry: "never",
    });
    const middleware = defineServiceMiddleware({
      id: "orders.reject",
      handler: async () => {
        throw new denied({ reason: "not allowed" });
      },
    });

    await expect(middleware.handler(invocation, async () => undefined)).rejects.toMatchObject({
      kind: "application",
      outcome: "declared-error",
      id: "orders.denied",
      retry: "never",
    });
  });

  test("rejects a function that already belongs to another service", () => {
    const target = defineFunction({
      id: "orders.get",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: async () => ({ ok: true }),
    });
    const first = defineService({ id: "orders", functions: { get: target } });

    expect(() => defineService({ id: "billing", functions: { get: target } })).toThrow(
      'already belongs to service "orders"',
    );
    expect(() => defineService({ id: "billing", functions: { get: first.get } })).toThrow(
      'already belongs to service "orders"',
    );
  });
});
