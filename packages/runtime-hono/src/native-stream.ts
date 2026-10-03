import { Context, Effect, Layer, Schema, Stream } from "effect";
import { httpIterable, observeHttp } from "./http-effect.js";
import { TextStreamItem } from "./native-stream.schemas.js";
import type { NativeStreamFormat } from "./native-stream.types.js";
export type { NativeStreamFormat } from "./native-stream.types.js";

/** Converts native application output into a scoped, backpressured byte stream.
 * @see tests/request-services.test.ts for checked early-return iterator cleanup.
 */
export class NativeStreams extends Context.Service<
  NativeStreams,
  {
    readonly encode: (
      source: AsyncIterable<unknown>,
      format: NativeStreamFormat,
    ) => Stream.Stream<Uint8Array, unknown>;
  }
>()("@relkit/runtime-hono/NativeStreams") {}

/** Scope closure returns the underlying application iterator exactly once. */
export const NativeStreamsLive = Layer.succeed(NativeStreams, {
  encode: (source, format) =>
    Stream.fromAsyncIterable(source, (error) => error).pipe(
      Stream.mapEffect(
        Effect.fn("NativeStreams.encodeItem")((value) =>
          observeHttp(
            "stream.encode",
            Effect.try({ try: () => encodeItem(value, format), catch: (error) => error }),
          ),
        ),
      ),
      Stream.withSpan("NativeStreams.encode"),
    ),
});

/** Encodes native iterator output with backpressure and the established response headers.
 * @param source - Native iterable or declared request-key source.
 * @param format - Declared SSE, text or byte representation.
 * @returns A Response whose body owns backpressure and source-iterator cleanup.
 */
export async function nativeStreamResponse(
  source: AsyncIterable<unknown>,
  format: NativeStreamFormat,
): Promise<Response> {
  const stream = Stream.unwrap(
    Effect.gen(function* () {
      return (yield* NativeStreams).encode(source, format);
    }),
  ).pipe(Stream.provide(NativeStreamsLive));
  const iterator = httpIterable(stream)[Symbol.asyncIterator]();
  const first = await iterator.next();
  const body = new ReadableStream<Uint8Array>({
    /** Queues the already-read first stream item without reading ahead.
     * @param controller - Native response-body controller used to emit and terminate chunks.
     * @returns Nothing; the first chunk is queued or the body is completed.
     */
    start(controller) {
      if (first.done) {
        complete(controller, format);
        return;
      }
      controller.enqueue(first.value);
    },
    /** Reads one downstream-requested chunk and finalizes the body at its terminal condition.
     * @param controller - Native response-body controller used to emit and terminate chunks.
     * @returns A Promise resolving after one chunk is queued or the terminal body state is applied.
     */
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (item.done) complete(controller, format);
        else controller.enqueue(item.value);
      } catch (error) {
        if (format === "sse") {
          controller.enqueue(
            encodeSse("relkit-error", {
              code: "RELKIT_STREAM_FAILED",
              message: "The stream ended with an application error.",
            }),
          );
          controller.close();
        } else {
          controller.error(error);
        }
      }
    },
    /** Returns the source iterator so cancellation releases its owned resources.
     * @param reason - Cancellation or interruption reason supplied by the owning boundary.
     * @returns The source-return completion Promise, or undefined when return is unavailable.
     */
    cancel(reason) {
      return iterator.return?.(reason).then(() => undefined);
    },
  });
  return new Response(body, { headers: headers(format) });
}

/** Closes the response body and emits the SSE completion frame when required.
 * @param controller - Native response-body controller used to emit and terminate chunks.
 * @param format - Declared SSE, text or byte representation.
 * @returns Nothing; the requested update is applied to the owned state.
 */
function complete(
  controller: ReadableStreamDefaultController<Uint8Array>,
  format: NativeStreamFormat,
): void {
  if (format === "sse") controller.enqueue(encodeSse("relkit-complete", { ok: true }));
  controller.close();
}

/** Enforces the declared native stream item representation before encoding bytes.
 * @param value - Value inspected, validated or projected by this operation.
 * @param format - Declared SSE, text or byte representation.
 * @returns Encoded SSE or text bytes, or the original validated byte chunk.
 */
function encodeItem(value: unknown, format: NativeStreamFormat): Uint8Array {
  if (format === "sse") return encodeSse("relkit-item", value);
  if (format === "text") {
    if (!Schema.is(TextStreamItem)(value)) {
      throw new TypeError("Native text streams require string items.");
    }
    return new TextEncoder().encode(value);
  }
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Native byte streams require Uint8Array items.");
  }
  return value;
}

/** Encodes one named SSE event with a JSON payload.
 * @param event - Event or record being projected into the target protocol.
 * @param data - Public payload encoded into the resulting protocol frame.
 * @returns UTF-8 bytes for one named SSE event and its JSON data.
 */
function encodeSse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Builds the native stream content-type and cache-control headers.
 * @param format - Declared SSE, text or byte representation.
 * @returns Content-type, no-transform cache and nosniff headers for the selected format.
 */
function headers(format: NativeStreamFormat): Readonly<Record<string, string>> {
  return {
    "cache-control": "no-cache, no-transform",
    "content-type":
      format === "sse"
        ? "text/event-stream; charset=UTF-8"
        : format === "text"
          ? "text/plain; charset=UTF-8"
          : "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
}
