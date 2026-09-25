import { Clock, Context, Duration, Effect, Exit, Layer, Metric, Schema } from "effect";
import type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
import type { RemoteFetch } from "./remote-request.types.js";
/** Network, status, or body failure from the remote observability endpoint. */
export class RemoteRequestError extends Schema.TaggedError<RemoteRequestError>()(
  "RemoteRequestError",
  {
    reason: Schema.Literals(["network", "status", "decode"]),
    message: Schema.String,
    status: Schema.optionalKey(Schema.Number),
  },
) {}
/** Substitutable HTTP transport for remote observability requests. */
// prettier-ignore
export class RemoteFetchService extends Context.Service<RemoteFetchService, RemoteFetch>()(
  "@relkit/observability/RemoteFetch",
) {}
/** Live transport that links Effect interruption to the fetch AbortSignal. */
export const remoteFetchLayer = Layer.succeed(
  RemoteFetchService,
  RemoteFetchService.of({
    execute: Effect.fn("ObservabilityRemote.fetch")((url: string, init: RequestInit) =>
      Effect.tryPromise({
        try: (signal) =>
          fetch(url, {
            ...init,
            signal: init.signal == null ? signal : AbortSignal.any([signal, init.signal]),
          }),
        catch: () =>
          new RemoteRequestError({
            reason: "network",
            message: "Telemetry storage request failed",
          }),
      }),
    ),
  }),
);
function observed<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    return yield* Effect.onExit(effect, (exit) =>
      Effect.gen(function* () {
        const duration = (yield* Clock.currentTimeMillis) - started;
        yield* Metric.update(
          Metric.counter("relkit_observability_remote_requests_total", {
            attributes: { outcome: Exit.isSuccess(exit) ? "success" : "failure" },
          }),
          1,
        );
        yield* Metric.update(
          Metric.timer("relkit_observability_remote_request_duration"),
          Duration.millis(duration),
        );
      }),
    );
  });
}
/**
 * Sends one authenticated request through an injectable Effect HTTP transport.
 *
 * @param remote - Endpoint URL and bearer token.
 * @param path - Endpoint path.
 * @param init - Request method, body, and optional deadline signal.
 * @returns Parsed JSON or a tagged network, status, or decode error.
 * @example
 * const page = await Effect.runPromise(remoteRequestEffect(remote, "/logs").pipe(
 *   Effect.provide(remoteFetchLayer),
 * ));
 */
export const remoteRequestEffect = Effect.fn("ObservabilityRemote.request")(function* <T>(
  remote: RemoteObservabilityOptions,
  path: string,
  init: RequestInit = {},
) {
  return yield* observed(
    Effect.acquireUseRelease(
      Effect.sync(() => new AbortController()),
      (controller) =>
        Effect.gen(function* () {
          const client = yield* RemoteFetchService;
          const signal = AbortSignal.any([
            controller.signal,
            init.signal ?? AbortSignal.timeout(15_000),
          ]);
          const response = yield* client.execute(`${remote.url}${path}`, {
            ...init,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${remote.token}`,
            },
            signal,
          });
          if (!response.ok)
            return yield* Effect.fail(
              new RemoteRequestError({
                reason: "status",
                status: response.status,
                message: `Telemetry storage returned ${response.status}`,
              }),
            );
          return yield* Effect.tryPromise({
            try: () => response.json() as Promise<T>,
            catch: () =>
              new RemoteRequestError({
                reason: "decode",
                message: "Telemetry storage response is invalid",
              }),
          });
        }),
      (controller) => Effect.sync(() => controller.abort()),
    ),
  );
});
