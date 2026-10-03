import { upgradeWebSocket, websocket } from "hono/bun";
import { createApp } from "../../src/index.ts";
import { queryPlan, manifest } from "./query-plan.ts";

const plan = queryPlan();
const app = createApp({
  plan,
  manifest: manifest(plan),
  engine: { invoke: async ({ input }) => input },
  upgradeWebSocket,
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
