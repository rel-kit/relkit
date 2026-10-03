import { expect, test } from "vitest";
import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createRpcRouter } from "../src/rpc.js";
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
    { errorStatusMap },
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
