import { upgradeWebSocket, websocket } from "hono/bun";
import { createLocalRealtimeProvider } from "@relkit/providers-local";
import { defineChannel } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createApp } from "../../src/index.ts";
import { channelPlan, manifest } from "./channel-plan.ts";
const { root }: { root: string } = JSON.parse(process.env.RELKIT_FIXTURE_CONFIG ?? "{}");
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
  hostname: "127.0.0.1",
  websocket,
  fetch: (request, bunServer) => app.fetch(request, bunServer),
});
process.send?.({ port: server.port });
process.once("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
