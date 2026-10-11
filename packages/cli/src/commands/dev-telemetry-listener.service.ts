/**
 * Adapts Bun's bounded loopback listener without loading persistent storage.
 * Construction acquires no resources. The consuming Effect scope owns the exact
 * listener and waits for its forced native stop before releasing that scope.
 */
import { Context, Effect, Layer } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import type { TelemetryListenerOperations } from "./dev-telemetry-listener.types.js";

/** Injectable loopback ingress with no database, compiler or exporter dependencies. */
export class CliTelemetryListener extends Context.Service<
  CliTelemetryListener,
  TelemetryListenerOperations
>()("relkit/cli/TelemetryListener", {
  make: Effect.sync(
    () =>
      ({
        listen: Effect.fn("DevTelemetry.listen")(
          (handler: (request: Request) => Promise<Response>) =>
            observeCli(
              "dev.telemetry.listen",
              cliTry("dev.telemetry.listen", () => {
                const server = Bun.serve({
                  hostname: "127.0.0.1",
                  port: 0,
                  maxRequestBodySize: 2_097_152,
                  fetch: handler,
                });
                return {
                  url: `http://127.0.0.1:${server.port}`,
                  stop: observeCli(
                    "dev.telemetry.listener-stop",
                    ownedNativePromise("dev.telemetry.listener-stop", () => server.stop(true)),
                  ),
                };
              }),
            ),
        ),
      }) satisfies TelemetryListenerOperations,
  ),
}) {}

/** Supplies Bun at the native boundary; future runtime adapters share this contract. */
export const telemetryListenerLayer = Layer.effect(CliTelemetryListener, CliTelemetryListener.make);
