import type { JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Exit, Layer, Stream } from "effect";
import { nativeCall, nativeStream } from "../native-stream.js";
import { resolveJobProcedure } from "./reconcile.js";
import { readWatchNext, timedCall } from "./read-timeout.js";
import { JobStreamGapError, JobStreamOverflowError } from "./stream-errors.js";
import { byteLength, streamIdentity, toAsyncIterator, validateFrame } from "./stream-support.js";
import type { JobStreamOptions } from "./stream.types.js";
import type { JobContentService } from "./content.types.js";

/** Named job content lifetime and bounded continuity contract. */
export class JobContent extends Context.Service<JobContent, JobContentService>()(
  "@relkit/client/JobContent",
) {}

/**
 * Provides named-content acquisition with scoped native pulls and bounded continuity.
 * @remarks The public open Promise eagerly acquires the same native response as
 * before. Its returned iterator aborts that response before return or throw joins
 * cleanup. Frame, JSON byte and item bounds retain their existing defaults.
 * @see packages/client/tests/compatibility/jobs-watch.test.ts for continuity assertions.
 */
export const JobContentLive = Layer.succeed(
  JobContent,
  JobContent.of({
    /** Acquires one native content response and transfers it to an iterator owner.
     * @typeParam Item - Declared JSON content payload.
     * @param client - Borrowed procedure client.
     * @param job - Declared job name.
     * @param options - Existing stream identity and read/memory bounds.
     * @returns Scoped frames preserving native errors and selective validation. */
    open: Effect.fn("JobContent.open")(
      <Item extends JsonValue>(
        client: unknown,
        job: string,
        options: JobStreamOptions,
      ): Effect.Effect<AsyncIterable<NamedStreamFrame<Item>>, unknown> =>
        Effect.suspend(() => {
          const controller = new AbortController();
          let acquired: AsyncIterator<unknown> | undefined;
          let closing: Promise<IteratorResult<unknown>> | undefined;
          const close = (): Promise<IteratorResult<unknown>> => {
            controller.abort();
            return (closing ??= Promise.resolve()
              .then(() => acquired?.return?.() ?? { done: true as const, value: undefined })
              .catch(() => ({ done: true as const, value: undefined })));
          };
          return Effect.acquireUseRelease(
            Effect.void,
            () =>
              observeExecution(
                "client",
                "jobs.content.open",
                Effect.gen(function* () {
                  const signal =
                    options.signal === undefined
                      ? controller.signal
                      : AbortSignal.any([controller.signal, options.signal]);
                  const call = resolveJobProcedure(client, job, "stream");
                  const value = yield* nativeCall(async (owned) =>
                    timedCall(
                      AbortSignal.any([signal, owned]),
                      options.readTimeoutMs ?? 10_000,
                      async () => {
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
                      },
                    ),
                  ).pipe(
                    Effect.onExit((exit) =>
                      Effect.sync(() => {
                        if (Exit.isFailure(exit)) controller.abort();
                      }),
                    ),
                  );
                  const iterator = yield* Effect.try({
                    try: () => {
                      acquired = toAsyncIterator(value);
                      return acquired;
                    },
                    catch: (cause) => cause,
                  }).pipe(
                    Effect.onExit((exit) =>
                      Effect.sync(() => {
                        if (Exit.isFailure(exit)) controller.abort();
                      }),
                    ),
                  );
                  let identity: string | undefined;
                  let sequence: number | undefined;
                  let frames = 0;
                  let bytes = 0;
                  const content = nativeStream(
                    "jobs.content.frames",
                    async () => ({ next: () => iterator.next(), return: close }),
                    signal,
                    Effect.void,
                    (iterator, owned) =>
                      options.signal?.aborted
                        ? Promise.reject(options.signal.reason)
                        : readWatchNext(iterator, owned, options.readTimeoutMs),
                  ).pipe(
                    Stream.mapEffect((value) =>
                      Effect.try({
                        try: () => {
                          const frame = validateFrame(value) as NamedStreamFrame<Item>;
                          const nextIdentity = streamIdentity(frame);
                          if (
                            frame.kind === "start" ||
                            frame.kind === "reset" ||
                            identity !== nextIdentity
                          ) {
                            identity = nextIdentity;
                            sequence = -1;
                          }
                          if (frame.kind === "chunk") {
                            if (byteLength(frame.item) > (options.maxItemBytes ?? 64 * 1024))
                              throw new JobStreamOverflowError("item-bytes");
                            if (sequence !== undefined && frame.sequence > sequence + 1)
                              throw new JobStreamGapError(sequence + 1, frame.sequence);
                            if (sequence !== undefined && frame.sequence <= sequence)
                              return undefined;
                            sequence = frame.sequence;
                          }
                          const size = byteLength(frame);
                          if (frames + 1 > (options.maxFrames ?? 128))
                            throw new JobStreamOverflowError("frames");
                          if (bytes + size > (options.maxBytes ?? 16 * 1024 * 1024))
                            throw new JobStreamOverflowError("bytes");
                          frames++;
                          bytes += size;
                          return frame;
                        },
                        catch: (cause) => cause,
                      }),
                    ),
                    Stream.filter((frame): frame is NamedStreamFrame<Item> => frame !== undefined),
                    Stream.takeUntil((frame) => frame.kind === "end"),
                  );
                  const edge = Stream.toAsyncIterable(content)[Symbol.asyncIterator]();
                  const adapted: AsyncIterator<NamedStreamFrame<Item>> = {
                    next: () => edge.next(),
                    return: async () => {
                      await close();
                      return await edge.return!();
                    },
                    throw: async (error) => {
                      await close();
                      return await edge.throw!(error);
                    },
                  };
                  return { [Symbol.asyncIterator]: () => adapted };
                }),
              ),
            (_, exit) => (Exit.isFailure(exit) ? Effect.promise(close) : Effect.void),
          );
        }),
    ),
  }),
);
