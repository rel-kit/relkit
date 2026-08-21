import { describe, expect, test } from "bun:test";
import type { FunctionRequest } from "@zsys/contracts";
import { defineError, defineFunction, defineService, defineServiceMiddleware } from "@zsys/app";
import { z } from "@zsys/schema";
import type { LocalStructuredLogger } from "@zsys/invocation";
import { invokeFunction } from "./src/index.ts";

describe("service runtime isolation", () => {
  test("attributes standalone members and keeps service context frozen", async () => {
    let invocation: { readonly serviceId?: string } | undefined;
    let logger: LocalStructuredLogger | undefined;
    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: (_input, _request, context) => {
        invocation = context.invocation;
        logger = context.log as LocalStructuredLogger;
        expect(Object.isFrozen(context.service)).toBe(true);
        context.log.info("lookup");
        return { ok: true };
      },
    });
    const service = defineService({ id: "orders", functions: { lookup: target } });

    await expect(service.lookup.invoke({})).resolves.toEqual({ ok: true });
    expect(invocation).toMatchObject({ serviceId: "orders" });
    expect(logger?.records).toMatchObject([{ functionId: "orders.lookup", serviceId: "orders" }]);
  });

  test("isolates concurrent patches and protects the raw request", async () => {
    const entered: string[] = [];
    let release!: () => void;
    let bothEntered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ready = new Promise<void>((resolve) => (bothEntered = resolve));
    let originalBody = "original";
    const middleware = defineServiceMiddleware({
      id: "orders.context",
      handler: async ({ input, request }, next) => {
        try {
          (request as { body: { value: string } } | undefined)!.body.value = "changed";
        } catch {
          // The request view is intentionally immutable.
        }
        await next({ actor: (input as { actor: string }).actor, nested: { ok: true } });
      },
    });
    const target = defineFunction({
      id: "orders.lookup",
      input: z.object({ actor: z.string() }),
      output: z.object({ actor: z.string(), body: z.string() }),
      handler: async (input, request, context) => {
        entered.push(input.actor);
        if (entered.length === 2) bothEntered();
        expect(Object.isFrozen(context.service)).toBe(true);
        expect(Object.isFrozen(context.service.nested)).toBe(true);
        expect(request?.params.orderId).toBe("order-1");
        expect(request?.query.tag).toEqual(["first", "second"]);
        expect(request?.headers.getAll("x-actor")).toEqual(["actor"]);
        expect(request?.metadata.kind).toBe("http");
        originalBody = (request?.body as { value: string }).value;
        await gate;
        return { actor: context.service.actor as string, body: originalBody };
      },
    });
    const service = defineService({
      id: "orders",
      functions: { lookup: target },
      middleware: [middleware],
    });
    const request = mutableRequest();
    const first = invokeFunction(service.lookup, { actor: "first" }, { request });
    const second = invokeFunction(service.lookup, { actor: "second" }, { request });

    await ready;
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { actor: "first", body: "original" },
      { actor: "second", body: "original" },
    ]);
    expect((request.body as { value: string }).value).toBe("original");
  });

  test("short-circuits safely and normalizes middleware failures", async () => {
    let missingCalls = 0;
    const missingTarget = defineFunction({
      id: "orders.missing-target",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      handler: () => {
        missingCalls += 1;
        return { ok: true };
      },
    });
    const missingService = defineService({
      id: "orders.missing-service",
      functions: { lookup: missingTarget },
      middleware: [
        defineServiceMiddleware({
          id: "orders.missing-next",
          handler: async () => undefined,
        }),
      ],
    });
    await expect(invokeFunction(missingService.lookup, {})).rejects.toMatchObject({
      code: "ZSYS_SERVICE_MIDDLEWARE_POLICY",
    });
    expect(missingCalls).toBe(0);

    const denied = defineError({
      id: "orders.denied",
      data: z.object({ reason: z.string() }),
      message: ({ reason }) => reason,
      retry: "never",
    });
    let rejectedCalls = 0;
    const rejectedTarget = defineFunction({
      id: "orders.rejected-target",
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      errors: [denied],
      handler: () => {
        rejectedCalls += 1;
        return { ok: true };
      },
    });
    const rejectedService = defineService({
      id: "orders.rejected-service",
      functions: { lookup: rejectedTarget },
      middleware: [
        defineServiceMiddleware({
          id: "orders.reject",
          handler: async () => {
            throw new denied({ reason: "not allowed" });
          },
        }),
      ],
    });
    await expect(invokeFunction(rejectedService.lookup, {})).rejects.toMatchObject({
      kind: "application",
      id: "orders.denied",
    });
    expect(rejectedCalls).toBe(0);
  });
});

function mutableRequest(): FunctionRequest {
  const body = { value: "original" };
  return {
    method: "POST",
    url: "http://zsys.test/orders",
    params: { orderId: "order-1" },
    query: { tag: ["first", "second"] },
    headers: {
      get: (name) => (name === "x-actor" ? "actor" : null),
      getAll: (name) => (name === "x-actor" ? ["actor"] : []),
      values: { "x-actor": "actor" },
    },
    metadata: { kind: "http" },
    body,
    bodyUsed: false,
    clone: () => mutableRequest(),
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
