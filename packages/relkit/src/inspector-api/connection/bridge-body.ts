/**
 * Reads bridge mutation bodies with an independent byte ceiling, including
 * streamed requests without content-length. The request owns this reader; EOF,
 * overflow and interruption all release it before forwarding can occur.
 */
import { Effect } from "effect";
import { connectionAttempt, rejectConnection } from "./connection-error.js";

/**
 * Admits at most one MiB of input, requiring JSON for private control operations.
 * @param request - Authenticated original request whose body this operation consumes.
 * @param requireJson - False only for the existing application route console.
 * @returns Bounded bytes or a typed safe body rejection, with native reader cleanup.
 */
export const readInspectionBody = Effect.fn("Inspection.readBody")(function* (
  request: Request,
  requireJson = true,
) {
  if (requireJson && !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? ""))
    return yield* rejectConnection("body.content-type");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    return yield* rejectConnection("body.length");
  if (length !== null && Number(length) > 1_048_576)
    return yield* rejectConnection("body.too-large");
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  return yield* Effect.acquireUseRelease(
    Effect.succeed(reader),
    (reader) =>
      Effect.gen(function* () {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = yield* connectionAttempt("body.read", () => reader.read());
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1_048_576) return yield* rejectConnection("body.too-large");
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      }),
    (reader) =>
      connectionAttempt("body.cancel", () => reader.cancel()).pipe(
        Effect.catchTag("InspectionConnectionError", () =>
          Effect.logWarning("Inspection request reader cancellation failed"),
        ),
        Effect.ensuring(Effect.sync(() => reader.releaseLock())),
      ),
  );
});
