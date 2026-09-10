import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, createWebSocketClient } from "@relkit/client";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalRealtimeProvider } from "@relkit/providers-local";
import { createProviderRealtimeDispatcher, defineChannel } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { upgradeWebSocket, websocket } from "hono/bun";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
const servers: Bun.Server<unknown>[] = [];
afterEach(async () => {
  servers.splice(0).forEach((server) => server.stop(true));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

test("managed realtime iterator tails an authorized retained channel", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-rpc-"));
  roots.push(root);
  const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
  const channel = defineChannel({
    id: "orders.updates",
    params: z.object({ id: z.string() }),
    events: { changed: z.object({ value: z.number() }) },
    client: { authorize: () => true },
    replay: { retentionMs: 300_000, maxEvents: 100 },
  });
  const plan = channelPlan();
  const app = createApp({
    upgradeWebSocket,
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    realtime: { applicationId: "fixture", environment: "test", provider: () => provider },
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const stream = await client["relkit.realtime.subscribe"]({
    channel: channel.id,
    params: { id: "one" },
  });
  const iterator = stream[Symbol.asyncIterator]();
  expect((await iterator.next()).value.kind).toBe("caught-up");
  const dispatcher = createProviderRealtimeDispatcher({
    applicationId: "fixture",
    environment: "test",
    generationId: "generation-a",
    publicFingerprint: "sha256:public",
    provider: () => provider,
  });
  await dispatcher.trigger({
    channel,
    params: { id: "one" },
    event: "changed",
    payload: { value: 1 },
  });
  expect(await iterator.next()).toMatchObject({
    value: { kind: "event", event: "changed", payload: { value: 1 } },
  });
  await iterator.return?.();
});

test("managed realtime iterator uses the same oRPC protocol over WebSockets", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-ws-"));
  roots.push(root);
  const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
  const channel = defineChannel({
    id: "orders.updates",
    params: z.object({ id: z.string() }),
    events: { changed: z.object({ value: z.number() }) },
    client: { authorize: () => true },
    replay: { retentionMs: 300_000, maxEvents: 100 },
  });
  const plan = channelPlan();
  const app = createApp({
    upgradeWebSocket,
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    realtime: { applicationId: "fixture", environment: "test", provider: () => provider },
  });
  const server = Bun.serve({
    port: 0,
    websocket,
    fetch: (request, bunServer) => app.fetch(request, bunServer),
  });
  servers.push(server);
  const client = createWebSocketClient<any>({ baseUrl: `http://127.0.0.1:${server.port}` });
  const stream = await client["relkit.realtime.subscribe"]({
    channel: channel.id,
    params: { id: "one" },
    expectedIdentity: { identityScope: "viewer", sessionEpoch: "session" },
  });
  const iterator = stream[Symbol.asyncIterator]();
  expect((await iterator.next()).value.kind).toBe("caught-up");
  await iterator.return?.();
});

function channelPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:realtime",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [
      {
        kind: "channel",
        id: "orders.updates",
        source: { file: "channel.ts", line: 1, column: 1 },
        params: {},
        events: {},
        profile: "default",
        client: "protected",
        replay: { retentionMs: 300_000, maxEvents: 100 },
      },
    ],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan, channel: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    channels: { "orders.updates": channel },
    middleware: {},
    requestTransforms: {},
  };
}
