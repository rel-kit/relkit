import { expect, test } from "bun:test";
import { createSupervisorProxy } from "./src/proxy.js";

test("HTTP and WebSocket forwarding retain the public authority without admitting foreign origins", async () => {
  const upstream = Bun.serve({
    port: 0,
    fetch(request, server) {
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        return new Response("Origin denied", { status: 403 });
      }
      if (server.upgrade(request)) return;
      return Response.json({ origin: new URL(request.url).origin });
    },
    websocket: { message() {} },
  });
  const proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port });
  const url = proxy.url;
  if (url === undefined) throw new Error("Proxy URL unavailable");
  let socket: WebSocket | undefined;
  try {
    const response = await fetch(url, { method: "POST", headers: { origin: url.origin } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ origin: url.origin });
    const denied = await fetch(url, { method: "POST", headers: { origin: "http://foreign.test" } });
    expect(denied.status).toBe(403);
    const connected = new WebSocket(new URL("/rpc", url).href.replace("http:", "ws:"), {
      headers: { origin: url.origin },
    });
    socket = connected;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket failed to stay open")), 1000);
      connected.addEventListener("open", () => {
        setTimeout(() => {
          clearTimeout(timer);
          resolve();
        }, 50);
      });
      connected.addEventListener("close", () => {
        clearTimeout(timer);
        reject(new Error("Socket closed"));
      });
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
  } finally {
    socket?.close();
    await proxy.stop();
    await upstream.stop(true);
  }
});
