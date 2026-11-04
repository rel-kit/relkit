// Serves one Hono app through the runtime adapter named by RELKIT_FIXTURE_RUNTIME. Plain JavaScript
// importing the built package, so the same file runs unchanged on Bun and on Node.
import { Hono } from "hono";
import { loadRuntimeAdapter } from "relkit/runtime";
import { installStaticFiles } from "relkit/runtime-hono";

const runtime = await loadRuntimeAdapter(process.env.RELKIT_FIXTURE_RUNTIME);
const app = new Hono();
app.get("/runtime", (context) =>
  context.json({
    name: runtime.name,
    hash: runtime.crypto.sha256Hex("relkit"),
    env: runtime.environment.get("RELKIT_FIXTURE_MARKER") ?? null,
  }),
);
app.get(
  "/ws",
  runtime.upgradeWebSocket(() => ({
    onMessage(event, socket) {
      socket.send(`echo:${typeof event.data === "string" ? event.data : "binary"}`);
    },
  })),
);
installStaticFiles(app, { root: process.env.RELKIT_FIXTURE_ROOT, files: runtime.files });
const server = await runtime.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request, bindings) => app.fetch(request, bindings),
});
process.send?.({ port: server.port });
process.once("SIGTERM", async () => {
  await server.stop(true);
  process.exit(0);
});
