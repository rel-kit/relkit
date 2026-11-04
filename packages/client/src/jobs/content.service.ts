import type { JsonValue } from "relkit/contracts";
import type { NamedStreamFrame } from "relkit/contracts/jobs";
import { resolveJobProcedure } from "./reconcile.js";
import { readWatchNext, timedCall } from "./read-timeout.js";
import { JobStreamGapError, JobStreamOverflowError } from "./stream-errors.js";
import { byteLength, streamIdentity, toAsyncIterator, validateFrame } from "./stream-support.js";
import type { JobStreamOptions } from "./stream.types.js";
import type { JobContentService } from "./content.types.js";

/**
 * Named-content acquisition with an owned native request and bounded continuity.
 * @remarks `open` eagerly acquires the native response. The returned iterator aborts
 * that response before return or throw joins cleanup. Frame, JSON byte and item bounds
 * keep their existing defaults.
 * @see packages/client/tests/compatibility/jobs-watch.test.ts for continuity assertions.
 * @example
 * ```ts
 * const frames = await jobContent.open(client, "exports", { runId, name: "text" });
 * for await (const frame of frames) console.log(frame.kind);
 * ```
 */
export const jobContent: JobContentService = {
  open: openJobContent,
};

/**
 * Acquires one native content response and transfers it to an iterator owner.
 * @typeParam Item - Declared JSON content payload.
 * @param client - Borrowed procedure client.
 * @param job - Declared job name.
 * @param options - Existing stream identity and read/memory bounds.
 * @returns Owned frames preserving native errors and selective validation.
 */
async function openJobContent<Item extends JsonValue>(
  client: unknown,
  job: string,
  options: JobStreamOptions,
): Promise<AsyncIterable<NamedStreamFrame<Item>>> {
  const controller = new AbortController();
  const signal =
    options.signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, options.signal]);
  let acquired: AsyncIterator<unknown> | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    controller.abort();
    return (closing ??= Promise.resolve()
      .then(() => acquired?.return?.())
      .then(
        () => undefined,
        () => undefined,
      ));
  };
  try {
    if (options.signal?.aborted) throw options.signal.reason;
    const call = resolveJobProcedure(client, job, "stream");
    const value = await timedCall(signal, options.readTimeoutMs ?? 10_000, async () => {
      const result = await call(
        {
          runId: options.runId,
          name: options.name,
          ...(options.after === undefined ? {} : { after: options.after }),
          ...(options.expectedIdentity === undefined
            ? {}
            : { expectedIdentity: options.expectedIdentity }),
        },
        { signal },
      );
      if (signal.aborted) await toAsyncIterator(result).return?.();
      return result;
    });
    acquired = toAsyncIterator(value);
    // A caller abort during transfer still owes the acquired native prefix its cleanup.
    if (options.signal?.aborted) throw options.signal.reason;
  } catch (error) {
    await close();
    throw error;
  }
  const edge = frames<Item>(acquired, signal, options, close);
  const adapted: AsyncIterator<NamedStreamFrame<Item>> = {
    next: () => edge.next(),
    return: async () => {
      await close();
      return await edge.return(undefined);
    },
    throw: async (error) => {
      await close();
      return await edge.throw(error);
    },
  };
  return { [Symbol.asyncIterator]: () => adapted };
}

/**
 * Pulls, validates and bounds named-content frames until the end frame or native EOF.
 * @typeParam Item - Declared JSON content payload.
 * @param iterator - Acquired native iterator.
 * @param signal - Request signal shared by the native call and each pull.
 * @param options - Existing read and memory bounds.
 * @param close - Idempotent request and iterator release.
 * @returns Admitted frames; every exit releases the request.
 */
async function* frames<Item extends JsonValue>(
  iterator: AsyncIterator<unknown>,
  signal: AbortSignal,
  options: JobStreamOptions,
  close: () => Promise<void>,
): AsyncGenerator<NamedStreamFrame<Item>, void, undefined> {
  const admit = contentAdmission<Item>(options);
  try {
    while (true) {
      if (options.signal?.aborted) throw options.signal.reason;
      const next = await readWatchNext(iterator, signal, options.readTimeoutMs);
      if (next.done === true) return;
      const frame = admit(next.value);
      if (frame === undefined) continue;
      yield frame;
      if (frame.kind === "end") return;
    }
  } finally {
    await close();
  }
}

/**
 * Creates the continuity and memory admission state for one content iterator.
 * @typeParam Item - Declared JSON content payload.
 * @param options - Existing frame, byte and item bounds.
 * @returns An admission check: a frame to publish, undefined for a duplicate, or a throw.
 */
function contentAdmission<Item extends JsonValue>(
  options: JobStreamOptions,
): (value: unknown) => NamedStreamFrame<Item> | undefined {
  let identity: string | undefined;
  let sequence: number | undefined;
  let frames = 0;
  let bytes = 0;
  return (value) => {
    const frame = validateFrame(value) as NamedStreamFrame<Item>;
    const nextIdentity = streamIdentity(frame);
    if (frame.kind === "start" || frame.kind === "reset" || identity !== nextIdentity) {
      identity = nextIdentity;
      sequence = -1;
    }
    if (frame.kind === "chunk") {
      if (byteLength(frame.item) > (options.maxItemBytes ?? 64 * 1024))
        throw new JobStreamOverflowError("item-bytes");
      if (sequence !== undefined && frame.sequence > sequence + 1)
        throw new JobStreamGapError(sequence + 1, frame.sequence);
      if (sequence !== undefined && frame.sequence <= sequence) return undefined;
      sequence = frame.sequence;
    }
    const size = byteLength(frame);
    if (frames + 1 > (options.maxFrames ?? 128)) throw new JobStreamOverflowError("frames");
    if (bytes + size > (options.maxBytes ?? 16 * 1024 * 1024))
      throw new JobStreamOverflowError("bytes");
    frames++;
    bytes += size;
    return frame;
  };
}
