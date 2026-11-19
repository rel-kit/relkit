/**
 * Serves HTTP on Node through Hono's Node server. Its WebSocket support routes `upgrade` events
 * through the same fetch handler, so WebSocket routes behave as they do on Bun.
 */
import { createAdaptorServer, type WebSocketServerLike } from "@hono/node-server";
import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { RuntimeServeOptions, RuntimeServer } from "../runtime-adapter.types.js";
import { answerClientErrors } from "./client-error.js";
import { isClosing, lingerOnClose } from "./lingering-close.js";

/**
 * Gives a request whose client declared no body a null body, as Bun does. Hono's Node server
 * hands every request other than GET and HEAD a body stream, so a bodiless `POST` would look like
 * one with an empty body, and a forwarding hop would send it on as chunked (RK-41).
 * @param request - Request built by Hono's Node server.
 * @returns The same request when its client declared a body (`Transfer-Encoding`, or a
 * `Content-Length` above zero); otherwise a copy without a body, with the same method, URL,
 * headers and signal.
 */
function withDeclaredBody(request: Request): Request {
  if (request.method === "GET" || request.method === "HEAD") return request;
  const headers = request.headers;
  if (headers.has("transfer-encoding")) return request;
  const length = headers.get("content-length");
  if (length !== null && Number(length) !== 0) return request;
  try {
    return new Request(request.url, { method: request.method, headers, signal: request.signal });
  } catch {
    // A method `Request` refuses (such as TRACE) keeps Hono's own request.
    return request;
  }
}

/**
 * Starts a Node listener.
 * @param options - Address, port and fetch handler; Node does not cap body size at the listener,
 * so RelKit's body-limit middleware alone enforces `maxBodyBytes`.
 * @returns The bound server once it listens.
 */
export async function serve(options: RuntimeServeOptions): Promise<RuntimeServer> {
  const sockets = new WebSocketServer({ noServer: true });
  const server = createAdaptorServer({
    fetch: (request, bindings) =>
      // Not handled: the answer could not be delivered, and the client sends the request again.
      isClosing(
        (bindings as { readonly incoming?: { readonly socket?: unknown } }).incoming?.socket,
      )
        ? new Response(null, { status: 503, headers: { connection: "close" } })
        : options.fetch(withDeclaredBody(request), bindings),
    hostname: options.hostname,
    port: options.port,
    // `ws` types `options.noServer` as optional; the server is created with it set.
    websocket: { server: sockets as unknown as WebSocketServerLike },
  });
  // Hono's Node server is an HTTP/1 `node:http` server here: no TLS or HTTP/2 option is passed.
  lingerOnClose(server as Server);
  answerClientErrors(server as Server);
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
