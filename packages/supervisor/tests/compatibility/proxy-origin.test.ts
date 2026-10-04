import { expect, test } from "bun:test";
import { createSupervisorProxy } from "../../src/proxy.js";

test("HTTP and WebSocket forwarding retain the public authority without admitting foreign origins", async () => {
  const upstream = Bun.serve({
    port: 0,
    /** Enforces the native backend origin contract. @param request - Public-authority request.
     * @param server - Owned backend. @returns Rejection, HTTP evidence, or upgrade acceptance. */
    fetch(request, server) {
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        return new Response("Origin denied", { status: 403 });
      }
      if (server.upgrade(request)) return;
      return Response.json({ origin: new URL(request.url).origin });
    },
    websocket: {
      /** Retains an idle native connection. @returns After ignoring the fixture frame. */
      message() {},
    },
  });
  const proxy = createSupervisorProxy({ port: 0 });
  await proxy.listen();
  proxy.switchTarget({ token: { sourceToken: 1, generationToken: 1 }, port: upstream.port! });
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
    const foreign = new WebSocket(new URL("/rpc", url).href.replace("http:", "ws:"), {
      headers: { origin: "http://foreign.test" },
    });
    try {
      const admitted = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Foreign handshake did not settle")), 1000);
        /** Records actual foreign handshake outcome. @param opened - Native acceptance. @returns After deadline removal. */
        const settled = (opened: boolean): void => {
          clearTimeout(timer);
          resolve(opened);
        };
        foreign.addEventListener("open", () => settled(true), { once: true });
        foreign.addEventListener("error", () => settled(false), { once: true });
        foreign.addEventListener("close", () => settled(false), { once: true });
      });
      expect(admitted).toBe(false);
    } finally {
      foreign.close();
    }
  } finally {
    socket?.close();
    await proxy.stop();
    await upstream.stop(true);
  }
});
