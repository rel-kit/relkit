import { Context, Effect, Layer } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp } from "./http-effect.js";
import type { RequestBodyBytes } from "./request-body-service.types.js";
export type { RequestBodyBytes } from "./request-body-service.types.js";

/** Owns the native reader until EOF, overflow, failure, or interruption.
 * @example
 * ```ts
 * const read = Effect.flatMap(RequestBodyReader, (reader) =>
 *   reader.read(new Request("http://example/body"), 2),
 * ).pipe(Effect.provide(Layer.succeed(RequestBodyReader, {
 *   read: () => Effect.succeed({ bytes: new Uint8Array([7]) }),
 * })));
 * ```
 * @see tests/request-services.test.ts for checked service substitution and reader cleanup.
 */
export class RequestBodyReader extends Context.Service<
  RequestBodyReader,
  {
    readonly read: (
      request: Request,
      maxBytes: number,
    ) => Effect.Effect<RequestBodyBytes, HttpBoundaryError>;
  }
>()("@relkit/runtime-hono/RequestBodyReader") {}

/** Read a bounded request body while retaining the reader until cleanup.
 * @param request - Fetch request or clone whose body this operation owns.
 * @param maxBytes - Positive maximum bytes accepted from headers or streamed chunks.
 * @returns An effect yielding body bytes or an overflow issue, with native failures preserved.
 */
const read = Effect.fn("RequestBodyReader.read")(function* (request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return yield* Effect.fail(
      new HttpBoundaryError({
        operation: "request.body",
        cause: new RangeError("maxBodyBytes must be a positive integer"),
      }),
    );
  }
  /** Build the shared overflow result for header and streamed-byte limit checks.
   * @returns A body-too-large issue naming the configured byte limit.
   */
  const oversized = (): RequestBodyBytes => ({
    issue: {
      code: "body-too-large",
      message: `Request body exceeds ${maxBytes} bytes`,
    },
  });
  const length = Number(request.headers.get("content-length"));
  if (Number.isSafeInteger(length) && length > maxBytes) return oversized();
  if (request.body === null) return { bytes: new Uint8Array() };
  const body = request.body;
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => ({ reader: body.getReader(), complete: false })),
    (owned) =>
      Effect.gen(function* () {
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const part = yield* httpBoundary("request.body.read", () => owned.reader.read());
          if (part.done) {
            owned.complete = true;
            break;
          }
          total += part.value.byteLength;
          if (total > maxBytes) return oversized();
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { bytes };
      }),
    (owned) =>
      Effect.sync(() => {
        // Request.clone() tees the source. Its cancellation Promise also waits for
        // the caller-owned branch, which must remain readable after mapping.
        try {
          if (!owned.complete) void owned.reader.cancel().catch(() => undefined);
        } finally {
          owned.reader.releaseLock();
        }
      }),
  );
});

/** Native implementation; replace this layer to supply deterministic body reads. */
export const RequestBodyReaderLive = Layer.succeed(RequestBodyReader, {
  read: (request, maxBytes) => observeHttp("request.body", read(request, maxBytes)),
});
