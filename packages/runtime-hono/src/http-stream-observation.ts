import { observeExecutionStream } from "@relkit/runtime-effect";
import type { Stream } from "effect";

/** Observes one stream from its first pull through EOF, failure or early return.
 * @typeParam A - Public stream element.
 * @typeParam E - Recoverable stream failure.
 * @typeParam R - Services needed by the stream.
 * @param operation - Bounded domain operation name.
 * @param stream - Lazy stream retaining its original element and failure contract.
 * @returns A stream with one shared lifetime observation and joined observer finalization.
 * @remarks A scoped waiter lets the shared operation instrumentation span all pulls.
 * Early return is interruption, while a naturally drained stream reports success.
 */
export function observeHttpStream<A, E, R>(
  operation: string,
  stream: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> {
  return observeExecutionStream("http", operation, stream);
}
