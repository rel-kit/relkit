import { createFixtureClient, appFetch } from "./fixture-client.js";
import { afterEach, expect, test } from "vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";

import { createApp } from "../src/index.ts";
import { createRpcRouter } from "../src/rpc.ts";
import { schema, queryPlan, manifest } from "./fixtures/query-plan.ts";
import { startBunFixture, type BunFixture } from "./bun-fixture.ts";

const servers: BunFixture[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

test("serves generated route descriptors through HTTP", async () => {
  const plan = queryPlan();
  let invocation: { readonly timeoutMs?: number } | undefined;
  const app = createApp({
    plan,
    manifest: manifest(plan),
    engine: {
      invoke: async (options) => {
        invocation = options;
        return options.input;
      },
    },
  });
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    fetch: appFetch(app),
  });
  await expect(client["GET /query"]({ value: 1 })).resolves.toEqual({ value: 1 });
  expect(invocation).not.toHaveProperty("timeoutMs");
});

test("maps agent state conflicts without reporting server failure", () => {
  const plan = queryPlan();
  const { errorStatusMap } = createRpcRouter({
    plan,
    manifest: manifest(plan),
    engine: { invoke: async ({ input }) => input },
  });
  expect(errorStatusMap.AGENT_BUSY).toBe(409);
  expect(errorStatusMap.AGENT_STOPPING).toBe(409);
});

test("streams generated route output through HTTP", async () => {
  const plan = queryPlan();
  const stream = {
    kind: "stream",
    item: schema,
    "~standard": {
      version: 1 as const,
      vendor: "relkit-test",
      validate: (value: unknown) => ({ value }),
    },
  };
  const app = createApp({
    plan,
    manifest: {
      ...manifest(plan),
      targets: { query: { input: schema, output: stream, errors: [] } },
    },
    engine: {
      invoke: async () =>
        (async function* () {
          yield 1;
          yield 2;
        })(),
    },
  });
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    fetch: appFetch(app),
  });
  const output = await client["GET /query"]({ value: 1 });
  const values: unknown[] = [];
  for await (const value of output as AsyncIterable<unknown>) values.push(value);
  expect(values).toEqual([1, 2]);
});

test("serves the existing oRPC router through Bun WebSockets", async () => {
  const server = await startBunFixture("rpc-websocket");
  servers.push(server);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/rpc`);
  const client = createORPCClient(new RPCLink({ connect: () => socket })) as {
    readonly "query.route": (input: unknown) => Promise<unknown>;
  };
  await expect(client["query.route"]({ value: 1 })).resolves.toEqual({ value: 1 });
  socket.close();
});
