/**
 * The development proxy's upstream client on Node. Node's `fetch` (undici) drops `Host` as a
 * forbidden header and names the private port instead, so the worker would judge `Origin` against
 * its own loopback address (RK-39); this client sends over `node:http`, which keeps the `Host` it
 * is given.
 */
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/** Bodiless response statuses, whose stream must stay null for `Response`. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/** Connection-scoped response headers; the proxy's own listener frames its answer itself. */
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * How long the rest of a request body may take once the worker answered before it was sent. A
 * body that ends within it was simply nearly sent; one still held back by the worker after it is
 * abandoned, so the answer is never kept waiting on a body the worker no longer reads (RK-42).
 */
export const EARLY_ANSWER_GRACE_MS = 250;

/**
 * Sends one upstream request over `node:http` and keeps the `Host` header it is given.
 *
 * The answer is delivered once the request body was sent, or, when the worker answered first, as
 * soon as the rest of the body will not be sent promptly: the worker closed or reset the
 * connection, or still held the body back after {@link EARLY_ANSWER_GRACE_MS}. The rest of the
 * body is then not sent, and the upstream connection is closed once the answer was read, never
 * reused. A send error is a failure only when no answer arrived.
 * @param input - Upstream URL. @param init - Method, headers, optional body and signal.
 * @returns The upstream status, end-to-end headers and unbuffered, undecoded body.
 */
export function hostPreservingFetch(
  input: URL | string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(input);
  const method = init.method ?? "GET";
  return new Promise<Response>((resolve, reject) => {
    const headers = new Headers(init.headers);
    // Keep-alive lets the worker drain a body it answered early instead of resetting the socket;
    // the connection is still closed after this one exchange.
    headers.set("connection", "keep-alive");
    const outgoing = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: Object.fromEntries(headers),
      agent: false,
      signal: init.signal ?? undefined,
    });
    const body =
      init.body === undefined || init.body === null ? null : new Response(init.body).body;
    const source =
      body === null ? undefined : Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
    let answer: Response | undefined;
    let sent = false;
    let delivered = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    /** Resolves with the answer once. */
    const deliver = (): void => {
      if (delivered || answer === undefined) return;
      delivered = true;
      clearTimeout(grace);
      resolve(answer);
    };
    /** Stops sending the rest of the body and delivers the answer. */
    const abandon = (): void => {
      if (delivered || answer === undefined) return;
      if (!sent && source !== undefined) {
        source.unpipe(outgoing);
        source.destroy();
      }
      deliver();
    };
    /** Abandons the body when the worker still holds it back once the grace has passed. */
    const judge = (): void => {
      if (outgoing.writableNeedDrain) abandon();
      else grace = setTimeout(judge, EARLY_ANSWER_GRACE_MS);
    };
    outgoing.once("finish", () => {
      sent = true;
      deliver();
    });
    // Kept after the answer too: a later abort or reset errors the answer's body stream instead.
    outgoing.on("error", (error) => {
      if (answer === undefined) reject(error);
      else abandon();
    });
    outgoing.once("response", (incoming) => {
      const received = new Headers();
      for (let index = 0; index + 1 < incoming.rawHeaders.length; index += 2) {
        const name = incoming.rawHeaders[index]!;
        if (!HOP_BY_HOP_RESPONSE_HEADERS.has(name.toLowerCase()))
          received.append(name, incoming.rawHeaders[index + 1]!);
      }
      const status = incoming.statusCode ?? 502;
      const empty = method === "HEAD" || NULL_BODY_STATUSES.has(status);
      if (empty) incoming.resume();
      // Never reused: once the answer was read (Readable.toWeb may read it before it is delivered),
      // the rest of an unsent body is abandoned and the connection closed.
      incoming.once("end", () => {
        abandon();
        outgoing.destroy();
      });
      outgoing.once("close", abandon);
      const stream = empty ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
      const statusText = incoming.statusMessage ?? "";
      answer = new Response(stream, { status, statusText, headers: received });
      if (sent) return deliver();
      // The worker ending its side means it will not take the rest of the body.
      incoming.socket.once("end", abandon);
      grace = setTimeout(judge, EARLY_ANSWER_GRACE_MS);
    });
    if (source === undefined) outgoing.end();
    else source.once("error", (error) => outgoing.destroy(error)).pipe(outgoing);
  });
}
