import type { AgentObservation } from "@relkit/contracts";
import { Effect, Stream } from "effect";
import { nativeStream } from "../native-stream.js";

/**
 * Transfers a native response reader into a scoped Effect parser and iterator edge.
 * @param body - Native response body owned by this observation.
 * @param controller - Request owner; cleanup never aborts a borrowed caller controller.
 * @param borrowed - Optional borrowed caller signal.
 * @returns One iterator whose return/throw cancels a pending reader before joining scope.
 */
export function agentSseObservations(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  borrowed?: AbortSignal,
): AsyncIterable<AgentObservation> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closing: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (closing ??= (async () => {
      controller.abort();
      borrowed?.removeEventListener("abort", abort);
      try {
        await reader.cancel(controller.signal.reason);
      } catch {
        /* Native cancellation can already have closed the reader. */
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* A cancelled reader may already be detached. */
        }
      }
    })());
  const abort = (): void => {
    void cleanup();
  };
  borrowed?.addEventListener("abort", abort, { once: true });
  if (borrowed?.aborted) abort();
  const native: AsyncIterator<Uint8Array> = {
    next: async () => {
      const next = await reader.read();
      return next.done ? { done: true, value: undefined } : { done: false, value: next.value };
    },
    return: async () => {
      await cleanup();
      return { done: true, value: undefined };
    },
  };
  const parsed = nativeStream("agent.sse.frames", async () => native, controller.signal).pipe(
    Stream.mapEffect((bytes) =>
      Effect.try({
        try: () => {
          buffer += decoder.decode(bytes, { stream: true }).replace(/\r\n/g, "\n");
          const values: AgentObservation[] = [];
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const value = decodeObservation(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (value !== undefined) values.push(value);
            boundary = buffer.indexOf("\n\n");
          }
          return values;
        },
        catch: (cause) => cause,
      }),
    ),
    Stream.flatMap((values) => Stream.fromIterable(values)),
  );
  const iterator = Stream.toAsyncIterable(parsed)[Symbol.asyncIterator]();
  const adapted: AsyncIterator<AgentObservation> = {
    next: () => iterator.next(),
    return: async () => {
      await cleanup();
      return await iterator.return!();
    },
    throw: async (error) => {
      await cleanup();
      return await iterator.throw!(error);
    },
  };
  return { [Symbol.asyncIterator]: () => adapted };
}

/**
 * Reads canonical observation metadata using the existing selective envelope check.
 * @param block - Complete SSE block.
 * @returns Original observation payload or undefined for another SSE event.
 */
function decodeObservation(block: string): AgentObservation | undefined {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data === "") return undefined;
  const event = JSON.parse(data) as unknown;
  if (!isRecord(event) || !isRecord(event.metadata) || !isRecord(event.metadata.relkit))
    return undefined;
  return event.metadata.relkit.observation as AgentObservation | undefined;
}

/**
 * Preserves the wire edge's existing object predicate, including arrays.
 * @param value - Unknown wire payload.
 * @returns Whether property lookup is permitted.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
