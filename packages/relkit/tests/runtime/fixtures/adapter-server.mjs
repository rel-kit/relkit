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
// Reports whether the handler received a body, and the framing headers it saw (RK-41).
app.all("/body", async (context) => {
  const request = context.req.raw;
  const bodyNull = request.body === null;
  return context.json({
    method: request.method,
    bodyNull,
    contentLength: request.headers.get("content-length"),
    transferEncoding: request.headers.get("transfer-encoding"),
    text: bodyNull ? null : await request.text(),
  });
});
// Reports the URL and `Host` the handler received (27.1).
app.get("/url", (context) =>
  context.json({ url: context.req.raw.url, host: context.req.header("host") ?? null }),
);
installStaticFiles(app, { root: process.env.RELKIT_FIXTURE_ROOT, files: runtime.files });
const server = await runtime.serve({
  hostname: "127.0.0.1",
  port: 0,
  // `/throw` fails outside the application's error mapping, as a framework defect would (27.1).
  fetch: (request, bindings) => {
    if (new URL(request.url).pathname === "/throw") throw new Error(`thrown at ${import.meta.url}`);
    return app.fetch(request, bindings);
  },
});
process.send?.({ port: server.port });
process.once("SIGTERM", async () => {
  await server.stop(true);
  process.exit(0);
});
