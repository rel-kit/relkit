import { expect, test } from "vitest";
import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { errorStatusInterceptor } from "../../src/runtime-hono/rpc-handler-options.js";
import { createRpcRouter } from "../../src/runtime-hono/rpc.js";
import { createApp } from "../../src/runtime-hono/index.ts";
import { defineChannel } from "../../src/realtime/index.js";
import { z } from "../../src/schema/index.js";
import { channelPlan, manifest } from "./fixtures/channel-plan.ts";

test.each([
  ["BAD_REQUEST", 400],
  ["UNAUTHORIZED", 401],
  ["FORBIDDEN", 403],
  ["NOT_FOUND", 404],
  ["TOO_MANY_REQUESTS", 429],
  ["INTERNAL_SERVER_ERROR", 500],
] as const)("RPC retains the standard %s status", async (code, status) => {
  const plan = channelPlan();
  const { errorStatusMap } = createRpcRouter({
    plan,
    manifest: manifest(plan, undefined),
    engine: { invoke: async () => undefined },
  });
  const handler = new RPCHandler(
    {
      fail: os.handler(() => {
        throw new ORPCError(code);
      }),
    },
    { clientInterceptors: [errorStatusInterceptor(errorStatusMap)] },
  );
  const result = await handler.handle(
    new Request("http://relkit.test/fail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    }),
  );
  expect(result.matched).toBe(true);
  expect(result.response?.status).toBe(status);
});

test("RPC answers a declared code with its mapped status", async () => {
  const handler = new RPCHandler(
    {
      fail: os.handler(() => {
        throw new ORPCError("IDENTITY_PRECONDITION_FAILED");
      }),
    },
    { clientInterceptors: [errorStatusInterceptor({ IDENTITY_PRECONDITION_FAILED: 409 })] },
  );
  const result = await handler.handle(
    new Request("http://relkit.test/fail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    }),
  );
  expect(result.response?.status).toBe(409);
});

/** Subscribes through the application with the given identity headers.
 * @param identityScope - The identity scope the client believes it holds.
 * @returns The HTTP response and the number of times the realtime provider was resolved.
 */
async function subscribeAs(identityScope: string) {
  const channel = defineChannel({
    id: "orders.updates",
    params: z.object({ id: z.string() }),
    events: { changed: z.object({ value: z.number() }) },
    client: { authorize: () => true },
    replay: { retentionMs: 300_000, maxEvents: 100 },
  });
  const plan = channelPlan();
  const provider = { opened: 0 };
  const app = createApp({
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    realtime: {
      applicationId: "fixture",
      environment: "test",
      provider: () => {
        provider.opened += 1;
        throw new Error("The provider is not reached in this test.");
      },
    },
  });
  const response = await app.fetch(
    new Request("http://relkit.test/_relkit/v1/rpc/relkit.realtime.subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relkit-identity-scope": identityScope,
        "x-relkit-session-epoch": "session",
      },
      body: JSON.stringify({ json: { channel: channel.id, params: { id: "one" } } }),
    }),
  );
  return { response, provider };
}

test("a realtime subscription with a stale identity scope answers 409 before opening", async () => {
  const { response, provider } = await subscribeAs("someone-else");
  expect(response.status).toBe(409);
  expect(await response.text()).toContain("IDENTITY_PRECONDITION_FAILED");
  expect(provider.opened).toBe(0);
});
