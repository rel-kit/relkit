/** Owns bounded native HTTP requests and listener probes for external scaffold acceptance. */
import { Effect } from "effect";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";

/**
 * Reserves and releases a dynamic port before child startup.
 * @returns The native port after the probe listener has closed.
 */
export const scaffoldPort = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })),
      (server) => Effect.promise(() => server.stop(true)),
    );
    if (server.port === undefined)
      return yield* new ScaffoldProcessFailure({
        operation: "http.port",
        message: "Cannot allocate a listener port",
      });
    return server.port;
  }),
);

/**
 * Performs a bounded native request with caller interruption.
 * @param url - Exact local acceptance URL.
 * @returns The native response or a normalized request failure.
 */
export function scaffoldRequest(url: string) {
  return Effect.tryPromise({
    try: (signal) => fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) }),
    catch: (cause) =>
      new ScaffoldProcessFailure({
        operation: "http.request",
        message: cause instanceof Error ? cause.message : "HTTP request failed",
      }),
  });
}

/**
 * Polls an owned child's listener without swallowing child exit or deadline failure.
 * @param child - Native process whose exit makes readiness impossible.
 * @param urls - Listeners that must all respond successfully.
 * @returns Completion once every listener is ready.
 */
export const awaitScaffoldHttp = Effect.fn("ScaffoldHttp.ready")(
  function* (child: Bun.ReadableSubprocess, urls: readonly string[]) {
    while (true) {
      if (child.exitCode !== null)
        return yield* new ScaffoldProcessFailure({
          operation: "http.ready",
          message: `Child exited before readiness (${child.exitCode})`,
        });
      const ready = yield* Effect.forEach(urls, (url) =>
        scaffoldRequest(url).pipe(
          Effect.map((response) => response.ok),
          Effect.catch(() => Effect.succeed(false)),
        ),
      );
      if (ready.every(Boolean)) return;
      yield* Effect.sleep("50 millis");
    }
  },
  (effect) => effect.pipe(Effect.timeout("90 seconds")),
);

/**
 * Proves a terminated child released a listener before the next acceptance run.
 * @param port - Native port owned by the completed child.
 * @returns Completion after binding and releasing the probe.
 */
export function assertScaffoldPortReleased(port: number) {
  return Effect.scoped(
    Effect.acquireRelease(
      Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() })),
      (server) => Effect.promise(() => server.stop(true)),
    ).pipe(Effect.asVoid),
  );
}
