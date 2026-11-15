/**
 * Lingering close for the Node listener. Node closes a connection right after an answer that
 * ends it (`Connection: close`, as after a 413), even while the client is still sending a body
 * the server will not read. Closing a socket with unread bytes makes the operating system reset
 * the connection, and a reset can discard the answer before the client has read it, or fail the
 * client's next write first, so the client sees a dropped connection instead of the answer
 * (RK-42). The listener instead ends its side, keeps reading and discarding what the client still
 * sends, and closes once the client has ended its side or a short bound has passed.
 */
import type { Server } from "node:http";
import type { Socket } from "node:net";

/** Connections the listener is closing; a request that still arrives on one is not handled. */
const closingSockets = new WeakSet<object>();

/**
 * Tells whether the listener is already closing a connection. The connection keeps reading for a
 * short while, so a request can still arrive on it; its answer could not be delivered, and the
 * client sends it again on a new connection, so handling it here would run it twice.
 * @param socket - Connection a request arrived on, when the listener exposes it.
 * @returns True once the connection started closing.
 */
export function isClosing(socket: unknown): boolean {
  return typeof socket === "object" && socket !== null && closingSockets.has(socket);
}

/** Longest time a closing connection keeps reading what its client still sends. */
const LINGER_MS = 2_000;

/**
 * Closes one connection gracefully: ends the server's side after pending writes, discards what
 * the client still sends, and destroys the socket once the client ended its side or after
 * {@link LINGER_MS}.
 * @param socket - Connection the server is done with.
 */
function lingeringClose(socket: Socket): void {
  if (socket.destroyed) return;
  const timer = setTimeout(() => socket.destroy(), LINGER_MS);
  timer.unref();
  socket.once("close", () => clearTimeout(timer));
  socket.once("end", () => {
    if (socket.writableFinished) socket.destroy();
    else socket.once("finish", () => socket.destroy());
  });
  socket.end();
  socket.resume();
}

/**
 * Makes every connection of a Node HTTP server close with {@link lingeringClose}, which Node's
 * HTTP server and Hono's Node listener reach through `socket.destroySoon`.
 * @param server - Node HTTP server, before it listens.
 */
export function lingerOnClose(server: Server): void {
  server.on("connection", (socket: Socket & { destroySoon?: () => void }) => {
    let closing = false;
    socket.destroySoon = () => {
      if (closing) return;
      closing = true;
      closingSockets.add(socket);
      lingeringClose(socket);
    };
  });
}
