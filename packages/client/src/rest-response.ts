/** Reads a REST route response as the call's output, stream or typed error. */
import { ORPCError } from "@orpc/client";
import type { ClientRouteEntry } from "./rest-routes.types.js";
import { readSse } from "./rest-sse.js";

/** Common error code for each HTTP status, as the oRPC protocol named them. */
const statusCodes: Readonly<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  402: "PAYMENT_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_SUPPORTED",
  406: "NOT_ACCEPTABLE",
  408: "TIMEOUT",
  409: "CONFLICT",
  410: "GONE",
  412: "PRECONDITION_FAILED",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_CONTENT",
  428: "PRECONDITION_REQUIRED",
  429: "TOO_MANY_REQUESTS",
  499: "CLIENT_CLOSED_REQUEST",
  500: "INTERNAL_SERVER_ERROR",
  501: "NOT_IMPLEMENTED",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

/**
 * Decodes one route response.
 * @param route - The called route.
 * @param response - The HTTP response.
 * @param abort - Aborts the request; a stream's `return` calls it to close the connection.
 * @returns The output: parsed JSON, text, a Blob for other bodies, or an async iterator for
 * a stream route.
 * @throws ORPCError with the declared code, or the common code for the status.
 * @example await decodeRestResponse(route, await fetch(url), () => controller.abort());
 */
export async function decodeRestResponse(
  route: ClientRouteEntry,
  response: Response,
  abort: () => void,
): Promise<unknown> {
  if (!response.ok) throw await restError(route, response);
  if (route.stream !== null && response.body !== null)
    return streamBody(route.stream, response.body, abort);
  if (response.status === 204 || response.status === 304) return undefined;
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (type === "application/json" || type.endsWith("+json")) {
    const text = await response.text();
    return text === "" ? undefined : JSON.parse(text);
  }
  if (type.startsWith("text/")) return response.text();
  const body = await response.blob();
  return body.size === 0 && type === "" ? undefined : body;
}

/**
 * Turns an error response into the error a call rejects with.
 * @param route - The called route, whose declared error codes are kept.
 * @param response - The error response, usually Problem Details.
 * @returns An ORPCError with code, status, message and data.
 */
async function restError(
  route: ClientRouteEntry,
  response: Response,
): Promise<ORPCError<string, unknown>> {
  let problem: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed !== null && typeof parsed === "object") problem = parsed as Record<string, unknown>;
  } catch {
    // A body that is not JSON keeps the status code only.
  }
  const reported = typeof problem.code === "string" ? problem.code : undefined;
  const code =
    reported !== undefined &&
    (route.errors.includes(reported) || /^[A-Z][A-Z0-9_]*$/.test(reported))
      ? reported
      : (statusCodes[response.status] ??
        (response.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST"));
  const data =
    problem.data !== undefined
      ? problem.data
      : Array.isArray(problem.issues)
        ? { issues: problem.issues }
        : undefined;
  return new ORPCError(code, {
    status: response.status,
    ...(typeof problem.detail === "string" ? { message: problem.detail } : {}),
    ...(data === undefined ? {} : { data }),
  } as ConstructorParameters<typeof ORPCError<string, unknown>>[1]);
}

/**
 * Reads a stream route's body as an async iterator.
 * @param format - The route's stream format.
 * @param body - Response body.
 * @param abort - Closes the connection when the caller stops early.
 * @returns Items: parsed SSE items, text chunks or byte chunks.
 */
function streamBody(
  format: "sse" | "text" | "bytes",
  body: ReadableStream<Uint8Array>,
  abort: () => void,
): AsyncIterableIterator<unknown> {
  const reader = body.getReader();
  const source: AsyncIterator<unknown> =
    format === "sse"
      ? readSse(reader)
      : {
          next: async () => {
            const chunk = await reader.read();
            if (chunk.done) return { done: true, value: undefined };
            return {
              done: false,
              value: format === "text" ? new TextDecoder().decode(chunk.value) : chunk.value,
            };
          },
        };
  const iterator: AsyncIterableIterator<unknown> = {
    next: () => source.next(),
    return: async (value?: unknown) => {
      abort();
      await reader.cancel().catch(() => undefined);
      return { done: true, value };
    },
    throw: async (error?: unknown) => {
      abort();
      await reader.cancel().catch(() => undefined);
      throw error;
    },
    [Symbol.asyncIterator]: () => iterator,
  };
  return iterator;
}
