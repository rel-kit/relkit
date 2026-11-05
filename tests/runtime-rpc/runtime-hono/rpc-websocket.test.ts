import { createFixtureClient, appFetch } from "./fixture-client.js";
import { afterEach, expect, test } from "vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";

import { createApp } from "relkit/runtime-hono";
import { createRpcRouter } from "../../../packages/relkit/src/runtime-hono/rpc.ts";
import {
  schema,
  queryPlan,
  manifest,
} from "../../../packages/relkit/tests/runtime-hono/fixtures/query-plan.ts";
import {
  startBunFixture,
  type BunFixture,
} from "../../../packages/relkit/tests/runtime-hono/bun-fixture.ts";

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
  // The typed client calls GET /query?value=1; a query value without a schema stays text.
  await expect(client["GET /query"]({ value: 1 })).resolves.toEqual({ value: "1" });
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
  const base = queryPlan();
  const plan = {
    ...base,
    httpTriggers: base.httpTriggers.map((trigger) => ({
      ...trigger,
      config: { ...trigger.config, stream: { format: "sse" as const } },
    })),
  };
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

test("the framework RPC endpoint answers over Bun WebSockets and serves no routes", async () => {
  const server = await startBunFixture("rpc-websocket");
  servers.push(server);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/_relkit/v1/rpc`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const client = createORPCClient(new RPCLink({ websocket: socket })) as {
    readonly "query.route": (input: unknown) => Promise<unknown>;
  };
  // Routes are called at their REST paths; the RPC endpoint only has channels, agents and jobs.
  await expect(client["query.route"]({ value: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  socket.close();
  expect((await fetch(`http://127.0.0.1:${server.port}/rpc`)).status).toBe(404);
});
