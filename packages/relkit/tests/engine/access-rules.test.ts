/** Function access rules are checked by the engine whatever started the call. */
import { describe, expect, test } from "vitest";
import { defineFunction } from "../../src/app/index.js";
import { sessionPrincipalSource } from "../../src/contracts/index.js";
import { defineEventFunction } from "../../src/events/index.js";
import { createFunctionTool } from "../../src/functions/function-tool.js";
import { z } from "../../src/schema/index.js";
import { defineService } from "../../src/services/index.js";
import {
  createRuntimeHandle,
  invokeFunction,
  type InvocationSource,
  type InvocationTarget,
} from "../../src/engine/index.js";

const calls: string[] = [];
const refundOrder = defineFunction({
  id: "orders.refund-order",
  input: z.object({ orderId: z.string(), ownerId: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  access: {
    roles: ["admin", "support"],
    permissions: ["orders:refund"],
    allow: ({ input }) => input.orderId !== "locked",
  },
  handler: async ({ orderId }) => {
    calls.push(orderId);
    return { refunded: true };
  },
});
const target = refundOrder as unknown as InvocationTarget;

function user(roles: readonly string[], permissions: readonly string[] = ["orders:refund"]) {
  return sessionPrincipalSource(
    async () => ({ user: { id: "u-1" } }),
    async () => ({ roles, hasPermission: (permission) => permissions.includes(permission) }),
  );
}

const input = { orderId: "o-1", ownerId: "u-1" };

const refundOnEvent = defineEventFunction({
  id: "orders.refund-on-request",
  event: "orders.refund-requested" as never,
  dependencies: { functions: { refundOrder } },
  handler: async (_event, context) => {
    await context.functions.refundOrder(input);
  },
}) as unknown as InvocationTarget;

describe.each([
  ["job", "job", target],
  ["task", "job", target],
  ["event", "event-delivery", refundOnEvent],
  ["tool", "tool", target],
  ["agent", "agent", target],
  ["direct", "direct", target],
] as const)("a %s call", (_name, source: InvocationSource, called: InvocationTarget) => {
  const value = called === target ? input : { orderId: "o-1" };

  test("runs for a caller with the role and permission", async () => {
    await expect(
      invokeFunction(called, value, { source, principal: user(["support"]) }),
    ).resolves.toEqual(called === target ? { refunded: true } : undefined);
  });

  test("is denied with a coded error for a caller without the role", async () => {
    await expect(
      invokeFunction(called, value, { source, principal: user(["member"]) }),
    ).rejects.toMatchObject({ code: "access-denied", status: 403 });
  });
});

test("background work without a session is unauthenticated", async () => {
  await expect(invokeFunction(target, input, { source: "job" })).rejects.toMatchObject({
    code: "unauthenticated",
    status: 401,
  });
});

test("a missing permission or a false predicate denies the call before the handler", async () => {
  calls.length = 0;
  await expect(
    invokeFunction(target, input, { source: "http", principal: user(["admin"], []) }),
  ).rejects.toMatchObject({ code: "access-denied" });
  await expect(
    invokeFunction(
      target,
      { ...input, orderId: "locked" },
      {
        source: "http",
        principal: user(["admin"]),
      },
    ),
  ).rejects.toMatchObject({ code: "access-denied" });
  expect(calls).toEqual([]);
});

test("without a principal the rule reads the handler context's session", async () => {
  const context = (session: unknown) => async (options: { readonly signal: AbortSignal }) => ({
    ...options,
    auth: { getSession: async () => session },
  });
  await expect(
    invokeFunction(
      defineFunction({
        id: "admin.stats",
        input: z.object({}),
        output: z.object({ ok: z.boolean() }),
        access: { roles: ["admin"] },
        handler: async () => ({ ok: true }),
      }) as unknown as InvocationTarget,
      {},
      { source: "http", hooks: { context: context({ user: { role: "admin" } }) } as never },
    ),
  ).resolves.toEqual({ ok: true });
});

test("an agent's tool call is denied as it would be over HTTP", async () => {
  const tool = createFunctionTool({
    id: "orders.refund-tool",
    target: refundOrder,
    description: "Refund an order",
    sideEffect: "write",
    approval: "never",
  });
  const agentTurn = (roles: readonly string[]) =>
    invokeFunction(
      defineFunction({
        id: "support.agent-turn",
        input: z.object({}),
        output: z.object({ refunded: z.boolean() }),
        handler: async () => tool.invoke(input),
      }) as unknown as InvocationTarget,
      {},
      { source: "agent", principal: user(roles) },
    );
  await expect(agentTurn(["support"])).resolves.toEqual({ refunded: true });
  await expect(agentTurn(["member"])).rejects.toMatchObject({ code: "access-denied" });
});

test("child calls inherit the caller of their parent", async () => {
  const parent = defineFunction({
    id: "orders.close",
    input: z.object({}),
    output: z.object({ refunded: z.boolean() }),
    dependencies: { functions: { refundOrder } },
    handler: async (_input, context) => context.functions.refundOrder(input),
  });
  await expect(
    invokeFunction(
      parent as unknown as InvocationTarget,
      {},
      {
        source: "http",
        principal: user(["member"]),
      },
    ),
  ).rejects.toMatchObject({ code: "access-denied" });
  await expect(
    invokeFunction(parent as unknown as InvocationTarget, {}, { source: "system" }),
  ).resolves.toEqual({ refunded: true });
});

describe("the runtime handle", () => {
  const handle = createRuntimeHandle({
    services: { orders: defineService({ functions: { refundOrder } }) },
    invoke: (_functionId, value, call) =>
      invokeFunction(target, value, {
        source: "system",
        ...(call?.principal === undefined ? {} : { principal: call.principal }),
      }),
    resolveAccess: async (session) => ({
      roles: (session as { readonly roles: readonly string[] }).roles,
      hasPermission: () => true,
    }),
  }) as unknown as {
    readonly functions: { readonly orders: { readonly refundOrder: typeof call } };
    readonly as: (session: unknown) => {
      readonly functions: { readonly orders: { readonly refundOrder: typeof call } };
    };
  };
  const call = (_value: typeof input): Promise<unknown> => Promise.resolve();

  test("calls run as system, which passes every access rule", async () => {
    await expect(handle.functions.orders.refundOrder(input)).resolves.toEqual({ refunded: true });
  });

  test("relkit.as(session) applies that user's roles", async () => {
    await expect(
      handle.as({ roles: ["support"] }).functions.orders.refundOrder(input),
    ).resolves.toEqual({ refunded: true });
    await expect(
      handle.as({ roles: ["member"] }).functions.orders.refundOrder(input),
    ).rejects.toMatchObject({ code: "access-denied" });
  });
});
