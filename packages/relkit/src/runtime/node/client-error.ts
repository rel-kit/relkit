/**
 * Answers the requests Node's HTTP parser refuses before a handler runs. `node:http` writes these
 * answers itself while nobody listens for `clientError`; listening makes them the adapter's to
 * write, so the 431 for oversized headers can carry a request ID like every other answer RelKit
 * sends. Every other refusal keeps the bytes Node writes on its own. Bun's server has no such hook:
 * there the runtime answers and no RelKit code runs.
 */
import type { Server } from "node:http";

const CLOSE = "Connection: close\r\n\r\n";
/** Node's own answers, by the error code its parser or its request timer reports. */
const NODE_ANSWERS: Readonly<Record<string, string>> = {
  HPE_CHUNK_EXTENSIONS_OVERFLOW: `HTTP/1.1 413 Payload Too Large\r\n${CLOSE}`,
  ERR_HTTP_REQUEST_TIMEOUT: `HTTP/1.1 408 Request Timeout\r\n${CLOSE}`,
};
const BAD_REQUEST = `HTTP/1.1 400 Bad Request\r\n${CLOSE}`;

/**
 * The bytes to write for one refusal.
 * @param code - Error code of the `clientError` event.
 * @returns Node's default answer, or the 431 with a request ID for oversized headers.
 */
export function refusalAnswer(code: string | undefined): string {
  if (code === "HPE_HEADER_OVERFLOW")
    return `HTTP/1.1 431 Request Header Fields Too Large\r\nx-request-id: request-${crypto.randomUUID()}\r\n${CLOSE}`;
  return NODE_ANSWERS[code ?? ""] ?? BAD_REQUEST;
}

/**
 * Makes a Node HTTP server answer parser refusals through {@link refusalAnswer}.
 * @param server - Node HTTP server, before it listens.
 */
export function answerClientErrors(server: Server): void {
  server.on("clientError", (error: NodeJS.ErrnoException, socket) => {
    // As `node:http` does: answer only while no response has started on this connection.
    const started =
      (socket as { readonly _httpMessage?: { readonly _headerSent?: boolean } })._httpMessage
        ?._headerSent === true;
    if (socket.writable && !started) socket.write(refusalAnswer(error.code));
    socket.destroy(error);
  });
}
