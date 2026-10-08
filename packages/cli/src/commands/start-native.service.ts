import { Context, Effect, Layer } from "effect";
import { cliAdapterError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import type { StartNativeOperations } from "./start.types.js";

/** Port allocation and cancellable HTTP readiness authority. */
export class CliStartNative extends Context.Service<CliStartNative, StartNativeOperations>()(
  "relkit/cli/StartNative",
) {}

/**
 * Captures native readiness requests without starting a background loop.
 * @param fetcher - Native cancellable fetch or signal-aware test replacement.
 * @returns The native capability Layer, with one finite scope per listener/response.
 */
export function startNativeLive(fetcher: typeof fetch = fetch) {
  return Layer.effect(
    CliStartNative,
    Effect.gen(function* () {
      const cleanup = yield* CliCleanup;
      return CliStartNative.of({
        allocate: Effect.fn("StartNative.allocate")(
          function* (port, hostname) {
            yield* cliTry("start.port", () => {
              if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
                throw new RangeError("port must be between 0 and 65535.");
            });
            if (port !== 0) return port;
            return yield* Effect.scoped(
              Effect.gen(function* () {
                const server = yield* Effect.acquireRelease(
                  cliTry("start.port.bind", () =>
                    Bun.serve({ hostname, port: 0, fetch: () => new Response() }),
                  ),
                  (server) =>
                    cleanupEffect(
                      "start.port.release",
                      cliPromise("start.port.close", async () => {
                        await server.stop(true);
                      }),
                    ).pipe(Effect.provideService(CliCleanup, cleanup)),
                );
                if (server.port === undefined)
                  return yield* Effect.fail(
                    cliAdapterError("start.port", new Error("Unable to allocate a start port.")),
                  );
                return server.port;
              }),
            );
          },
          (effect) => observeCli("start.port.allocate", effect),
        ),
        health: Effect.fn("StartNative.health")(
          (url) =>
            Effect.scoped(
              Effect.acquireRelease(
                cliPromise("start.health", (signal) => fetcher(url, { signal })),
                (response) =>
                  response.body === null
                    ? Effect.void
                    : cleanupEffect(
                        "start.health.release",
                        cliPromise("start.health.cancel", () => response.body!.cancel()),
                      ).pipe(Effect.provideService(CliCleanup, cleanup)),
                { interruptible: true },
              ).pipe(Effect.map((response) => response.ok)),
            ),
          (effect) => observeCli("start.health.request", effect),
        ),
      });
    }),
  );
}
