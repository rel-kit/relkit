/**
 * Serves HTTP on Node through Hono's Node server. Its WebSocket support routes `upgrade` events
 * through the same fetch handler, so WebSocket routes behave as they do on Bun.
 */
import { createAdaptorServer, type WebSocketServerLike } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { RuntimeServeOptions, RuntimeServer } from "../runtime-adapter.types.js";

/**
 * Starts a Node listener.
 * @param options - Address, port and fetch handler; Node does not cap body size at the listener,
 * so RelKit's body-limit middleware alone enforces `maxBodyBytes`.
 * @returns The bound server once it listens.
 */
export async function serve(options: RuntimeServeOptions): Promise<RuntimeServer> {
  const sockets = new WebSocketServer({ noServer: true });
  const server = createAdaptorServer({
    fetch: (request, bindings) => options.fetch(request, bindings),
    hostname: options.hostname,
    port: options.port,
    // `ws` types `options.noServer` as optional; the server is created with it set.
    websocket: { server: sockets as unknown as WebSocketServerLike },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return Object.freeze({
    port: typeof address === "object" && address !== null ? address.port : options.port,
    stop: (force?: boolean) =>
      new Promise<void>((resolve) => {
        if (force === true) {
          for (const client of sockets.clients) client.terminate();
          if ("closeAllConnections" in server) server.closeAllConnections();
        }
        server.close(() => resolve());
      }),
  });
}
