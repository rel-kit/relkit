import { Deferred, Effect, Exit, Scope } from "effect";
import type { ProxyBodyOptions } from "./proxy-body.types.js";

/**
 * Adapts native body pulls to an owned request lifetime without prefetching.
 * @param response - Upstream headers and byte stream.
 * @param options - Scope, completion latch and captured observer context.
 * @returns A response whose EOF, cancellation or failure settles the request worker.
 */
export const ownProxyBody = Effect.fn("SupervisorProxy.ownBody")(function* (
  response: Response,
  options: ProxyBodyOptions,
) {
  if (response.body === null) {
    yield* Deferred.succeed(options.completed, undefined);
    return response;
  }
  const reader = response.body.getReader();
  const run = Effect.runPromiseExitWith(options.context);
  let finished = false;
  let downstream: ReadableStreamDefaultController<Uint8Array> | undefined;
  /** Settles the body once before joining its request worker. @param exit - Native EOF/cancel/failure outcome.
   * @returns Joined worker completion. */
  const settle = async (exit: Exit.Exit<void, unknown>): Promise<void> => {
    if (finished) return;
    finished = true;
    await run(Deferred.done(options.completed, exit));
    await run(options.join());
  };
  /** Errors an outstanding native body pull without aborting the caller. @returns Nothing after settlement. */
  const aborted = (): void => {
    if (!finished) downstream?.error(options.signal.reason);
  };
  options.signal.addEventListener("abort", aborted, { once: true });
  yield* Scope.addFinalizer(
    options.scope,
    Effect.tryPromise({
      try: async () => {
        options.signal.removeEventListener("abort", aborted);
        if (!finished) {
          finished = true;
          downstream?.error(
            options.signal.aborted
              ? options.signal.reason
              : new Error("Supervisor proxy request closed."),
          );
        }
        try {
          await reader.cancel();
        } catch {
          /* Preserve the upstream outcome. */
        }
        reader.releaseLock();
      },
      catch: () => undefined,
    }).pipe(Effect.catch(() => Effect.void)),
  );
  const body = new ReadableStream<Uint8Array>(
    {
      /** Retains the native downstream controller. @param controller - Body controller. @returns After registration. */
      start(controller) {
        downstream = controller;
      },
      /** Pulls one native chunk and settles on EOF or failure. @param controller - Body controller. @returns Pull settlement. */
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (finished) return;
          if (chunk.done) {
            await settle(Exit.void);
            controller.close();
          } else controller.enqueue(chunk.value);
        } catch (error) {
          if (finished) return;
          await settle(Exit.fail(error));
          controller.error(error);
        }
      },
      /** Cancels the actual upstream reader before releasing its lease. @param reason - Native reason. @returns Joined cleanup. */
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          await settle(Exit.interrupt());
        }
      },
    },
    { highWaterMark: 0 },
  );
  return preserveResponseMetadata(
    response,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  );
}, Effect.uninterruptible);

/** Preserves native response metadata and cloned-body ownership.
 * @param original - Native upstream response. @param owned - Scoped body adapter.
 * @returns The adapter with original readonly metadata and native tee/clone behavior.
 */
function preserveResponseMetadata(original: Response, owned: Response): Response {
  Object.defineProperties(owned, {
    url: { value: original.url, configurable: true },
    redirected: { value: original.redirected, configurable: true },
    type: { value: original.type, configurable: true },
    clone: {
      value: () => preserveResponseMetadata(original, Response.prototype.clone.call(owned)),
    },
  });
  return owned;
}
