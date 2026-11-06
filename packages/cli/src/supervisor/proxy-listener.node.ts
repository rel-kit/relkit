/**
 * The supervisor's stable listener on Node: the runtime adapter's `serve` with Hono's Node
 * WebSocket upgrade. Plain requests go to the proxy's handler; an upgrade request first pins its
 * generation and connects upstream (the same tunnel the Bun listener uses), and only then is the
 * downstream socket accepted, so a rejected upstream still answers with an HTTP error.
 */
import { Hono } from "hono";
import type { RuntimeAdapter, RuntimeServer } from "relkit/runtime";
import { closeTunnel, forwardDownstream } from "./proxy-websocket.js";
import type { ProxySocketData } from "./proxy-websocket.types.js";

/** Request handling the listener delegates to the proxy. */
export interface ProxyListenerHandlers {
  /**
   * Forwards one plain request.
   * @param request - Incoming request.
   * @returns The upstream response.
   */
  readonly handle: (request: Request) => Promise<Response>;
  /**
   * Opens one tunnel and accepts the downstream socket through `accept`.
   * @param request - Upgrade request.
   * @param accept - Receives the tunnel bindings once upstream accepted.
   * @returns The response to send when the tunnel was not accepted.
   */
  readonly upgrade: (
    request: Request,
    accept: (data: ProxySocketData) => boolean,
  ) => Promise<Response>;
}

/**
 * Starts the Node listener.
 * @param runtime - Node runtime adapter.
 * @param hostname - Listener host.
 * @param port - Listener port; `0` picks a free one.
 * @param handlers - Proxy request handling.
 * @returns The bound server.
 */
export function listenNodeProxy(
  runtime: RuntimeAdapter,
  hostname: string,
  port: number,
  handlers: ProxyListenerHandlers,
): Promise<RuntimeServer> {
  const app = new Hono<{ Variables: { tunnel: ProxySocketData } }>();
  app.use("*", async (context, next) => {
    if (context.req.header("upgrade")?.toLowerCase() !== "websocket")
      return handlers.handle(context.req.raw);
    let accepted: ProxySocketData | undefined;
    const response = await handlers.upgrade(context.req.raw, (data) => {
      accepted = data;
      return true;
    });
    if (accepted === undefined) return response;
    context.set("tunnel", accepted);
    await next();
    return undefined;
  });
  app.get(
    "*",
    runtime.upgradeWebSocket((context) => {
      const tunnel = context.get("tunnel") as ProxySocketData;
      return {
        onOpen: (_event, socket) =>
          tunnel.open({
            get readyState() {
              return socket.readyState;
            },
            // Frames are never backed by a SharedArrayBuffer here.
            send: (data) => socket.send(data as string | Uint8Array<ArrayBuffer>),
            close: (code, reason) => socket.close(code, reason),
          }),
        onMessage: (event) => {
          const data = event.data;
          if (typeof data === "string" || data instanceof Uint8Array)
            forwardDownstream(tunnel, data);
          else if (data instanceof ArrayBuffer) forwardDownstream(tunnel, new Uint8Array(data));
        },
        onClose: (event) => closeTunnel(tunnel, event.code, event.reason),
        onError: () => closeTunnel(tunnel, 1011, "Downstream WebSocket failed."),
      };
    }),
  );
  return runtime.serve({
    hostname,
    port,
    fetch: (request, bindings) => app.fetch(request, bindings),
  });
}
