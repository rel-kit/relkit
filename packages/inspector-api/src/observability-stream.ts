import { Context, Effect, Exit, Scope, Stream } from "effect";
import {
  observeExecutionStream,
  runExecutionPromise,
  runExecutionSync,
} from "@relkit/contracts/operation";
import { canonicalJson } from "@relkit/contracts";
import type {
  ObservabilityStream,
  ObservabilityStreamEvent,
  ObservabilityStreamSubscriptionOptions,
} from "@relkit/observability";
import { inspectorExecution } from "./execution.js";
import { readStreamOptions } from "./observability-utils.js";
import { InspectorBoundaryError } from "./native-edge.js";

/**
 * Creates an SSE response whose scope owns the live feed, timer and pending pulls.
 * @param stream - Native stream authority, already protected by the installing router.
 * @param request - Native request supplying replay/filter options and cancellation.
 * @param apiVersion - Public response version header.
 * @param heartbeatIntervalMs - Native keepalive interval; defaults to five seconds.
 * @param executionContext - Optional caller context retaining configured loggers and metric registry.
 * @returns A backpressured SSE response; cancelling its body awaits scope cleanup.
 * @remarks Comments have no event ID and never advance replay cursors. The timer
 * remains a native callback because it must enqueue while a live feed pull waits.
 * That resource is acquired and finalized inside the response scope.
 * @example
 * ```ts
 * import { createObservabilityStream } from "@relkit/observability";
 * import { streamResponse } from "@relkit/inspector-api";
 * const source = createObservabilityStream();
 * const response = streamResponse(source, new Request("http://localhost"), 1);
 * try { await response.body!.cancel(); } finally { source.close(); }
 * ```
 */
export function streamResponse(
  stream: ObservabilityStream,
  request: Request,
  apiVersion: number,
  heartbeatIntervalMs = 5_000,
  executionContext?: Context.Context<never>,
): Response {
  const { type, ...options } = readStreamOptions(request);
  const scope = Scope.makeUnsafe();
  const feed = runExecutionSync(
    inspectorExecution,
    inheritContext(
      Scope.provide(
        Effect.acquireRelease(
          Effect.sync(() => stream.subscribe(options as ObservabilityStreamSubscriptionOptions)),
          (owned) => Effect.sync(() => owned.close()),
        ),
        scope,
      ),
      executionContext,
    ),
  );
  const abort = new AbortController();
  let closed = false;
  let connected = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let disposal: Promise<void> | undefined;
  let responseController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const source = Stream.fromAsyncIterable(
    feed,
    (cause) => new InspectorBoundaryError({ kind: "native", cause }),
  ).pipe(
    Stream.filter((event) => type === undefined || event.type === type),
    (events) =>
      observeExecutionStream("inspector", "observability.subscribe", events, () => ({
        feeds: 1,
      })),
  );
  let pull: ReturnType<typeof preparePull> | undefined;
  const close = (exit: Exit.Exit<unknown, unknown> = Exit.interrupt()): Promise<void> => {
    if (disposal !== undefined) return disposal;
    closed = true;
    // Abort can precede pull startup; closing here also resolves that pending reader.
    try {
      responseController?.close();
    } catch {
      /* Native cancellation already closed it. */
    }
    // Native close releases an uncancellable next() before its Effect waiter is interrupted.
    feed.close();
    clearInterval(heartbeat);
    heartbeat = undefined;
    abort.abort();
    request.signal.removeEventListener("abort", onAbort);
    disposal = runExecutionPromise(
      inspectorExecution,
      inheritContext(Scope.close(scope, exit), executionContext),
    );
    return disposal;
  };
  const onAbort = (): void => {
    void close().catch(() => undefined);
  };
  request.signal.addEventListener("abort", onAbort, { once: true });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      responseController = controller;
      if (request.signal.aborted) {
        onAbort();
        return;
      }
      runExecutionSync(
        inspectorExecution,
        inheritContext(
          Scope.provide(
            Effect.acquireRelease(
              Effect.sync(() => {
                heartbeat = setInterval(() => {
                  // Comments respect native backpressure even when an event pull is pending.
                  if (!closed && (controller.desiredSize ?? 0) > 0)
                    controller.enqueue(encoder.encode(": heartbeat\n\n"));
                }, heartbeatIntervalMs);
              }),
              () =>
                Effect.sync(() => {
                  clearInterval(heartbeat);
                  heartbeat = undefined;
                }),
            ),
            scope,
          ),
          executionContext,
        ),
      );
    },
    async pull(controller) {
      if (closed) return;
      if (!connected) {
        connected = true;
        controller.enqueue(encoder.encode(": connected\n\n"));
        return;
      }
      try {
        pull ??= preparePull(source, scope, executionContext);
        const next = await pull;
        const chunk = await runExecutionPromise(
          inspectorExecution,
          inheritContext(next, executionContext),
          { signal: abort.signal },
        );
        if (!closed)
          for (const event of chunk) controller.enqueue(encoder.encode(eventFrame(event)));
      } catch {
        // Existing SSE failure/EOF behavior is a closed body, never a synthetic event.
        await close(Exit.void);
        try {
          controller.close();
        } catch {
          /* Native cancellation may already close the controller. */
        }
      }
    },
    cancel: () => close(),
  });
  return new Response(body, {
    headers: {
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-relkit-api-version": String(apiVersion),
    },
  });
}

/**
 * Acquires a lazy stream pull inside its response-owned scope.
 * @param source - Observed source whose iterator belongs to the response.
 * @param scope - Response scope closed by native abort, cancellation or EOF.
 * @param context - Captured caller context for configured observation adapters.
 * @returns A reusable pull; acquisition runs once, independently of HTTP requests.
 */
function preparePull(
  source: Stream.Stream<ObservabilityStreamEvent, InspectorBoundaryError>,
  scope: Scope.Scope,
  context?: Context.Context<never>,
) {
  return runExecutionPromise(
    inspectorExecution,
    inheritContext(Scope.provide(Stream.toPull(source), scope), context),
  );
}

/**
 * Retains caller logging/metrics while execution stays on the reused native-edge runtime.
 * @typeParam A - Successful result.
 * @typeParam E - Typed failure.
 * @param effect - Response-owned effect requiring no additional domain services.
 * @param context - Optional caller context captured before crossing native callbacks.
 * @returns The same effect and causes under the supplied context, when present.
 */
function inheritContext<A, E>(
  effect: Effect.Effect<A, E>,
  context?: Context.Context<never>,
): Effect.Effect<A, E> {
  return context === undefined ? effect : Effect.provideContext(effect, context);
}

/**
 * Encodes one authoritative event without changing its cursor.
 * @param event - Native event with its assigned replay cursor.
 * @returns One complete SSE event frame.
 */
function eventFrame(event: ObservabilityStreamEvent): string {
  return `id: ${event.cursor}\nevent: ${event.type}\ndata: ${canonicalJson(event)}\n\n`;
}
