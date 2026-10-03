import { createFixtureClient, createFixtureWebSocketClient, appFetch } from "./fixture-client.js";
import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLocalRealtimeProvider } from "@relkit/providers-local";
import { createProviderRealtimeDispatcher, defineChannel } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp } from "../src/index.ts";
import { channelPlan, manifest } from "./fixtures/channel-plan.ts";
import { startBunFixture, type BunFixture } from "./bun-fixture.ts";

const roots: string[] = [];
const servers: BunFixture[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
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
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
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
  const { presence: _presence, ...publishedChannel } = channel;
  await dispatcher.trigger({
    channel: publishedChannel,
    params: { id: "one" },
    event: "changed",
    payload: { value: 1 },
  });
  expect(await iterator.next()).toMatchObject({
    value: { kind: "event", event: "changed", payload: { value: 1 } },
  });
  await iterator.return?.();

  const invalid = await client["relkit.realtime.subscribe"]({
    channel: channel.id,
    params: { id: 42 },
  });
  await expect(invalid[Symbol.asyncIterator]().next()).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
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
  const server = await startBunFixture("realtime-rpc", { root });
  servers.push(server);
  const client = createFixtureWebSocketClient({ baseUrl: `http://127.0.0.1:${server.port}` });
  const stream = await client["relkit.realtime.subscribe"]({
    channel: channel.id,
    params: { id: "one" },
    expectedIdentity: { identityScope: "viewer", sessionEpoch: "session" },
  });
  const iterator = stream[Symbol.asyncIterator]();
  expect((await iterator.next()).value.kind).toBe("caught-up");
  await iterator.return?.();
});
