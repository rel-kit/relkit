import { afterEach, expect, test } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterContractClient } from "@orpc/contract";
import { createClient } from "@relkit/client";
import { upgradeWebSocket, websocket } from "hono/bun";
import type { RegistrationPlan } from "@relkit/graph";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { createRpcRouter } from "./src/rpc.ts";
import { runtimeCohort } from "./test-cohort.ts";

const servers: Bun.Server<unknown>[] = [];
afterEach(() => servers.splice(0).forEach((server) => server.stop(true)));

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
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    fetch: (request, init) => app.fetch(new Request(request, init)),
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
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const output = await client["GET /query"]({ value: 1 });
  const values: unknown[] = [];
  for await (const value of output) values.push(value);
  expect(values).toEqual([1, 2]);
});

test("serves the existing oRPC router through Bun WebSockets", async () => {
  const plan = queryPlan();
  const app = createApp({
    plan,
    manifest: manifest(plan),
    engine: { invoke: async ({ input }) => input },
    upgradeWebSocket,
  });
  const server = Bun.serve({
    port: 0,
    websocket,
    fetch: (request, bunServer) => app.fetch(request, bunServer),
  });
  servers.push(server);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/rpc`);
  const client = createORPCClient(
    new RPCLink({ connect: () => socket }),
  ) as RouterContractClient<any>;
  await expect(client["query.route"]({ value: 1 })).resolves.toEqual({ value: 1 });
  socket.close();
});

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "relkit-test",
    validate: (value: unknown) => ({ value }),
  },
};

function queryPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:websocket",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "query.route",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "query",
        config: {
          method: "GET",
          path: "/query",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
          client: { operation: "query" },
          timeoutMs: null,
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: { query: async (input: unknown) => input },
    targets: { query: { input: schema, output: schema, errors: [] } },
    middleware: {},
    requestTransforms: {},
  };
}
