/**
 * Imports persistent telemetry only in its independently owned support fiber.
 * Shared cleanup authority is captured at acquisition; the operation retains the
 * session Scope and joins finite module loading before native storage acquisition.
 */
import { Context, Effect, Layer } from "effect";
import { CliCleanup } from "../services/cleanup.service.js";
import { ownedNativePromise } from "../services/owned-promise.js";
import { observeCli } from "../cli-runtime.js";
import type { TelemetryStorageOperations } from "./dev-telemetry-storage.types.js";
import type { TelemetryConfiguration } from "@relkit/observability";

/** Substitutable delayed persistence; construction imports no native storage module. */
export class CliTelemetryStorage extends Context.Service<
  CliTelemetryStorage,
  TelemetryStorageOperations
>()("relkit/cli/TelemetryStorage", {
  make: Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return {
      acquire: Effect.fn("DevTelemetry.storageAcquire")(
        (root: string, configuration: TelemetryConfiguration, onFailure: (error: Error) => void) =>
          observeCli(
            "dev.telemetry.storage-acquire",
            Effect.gen(function* () {
              const operation = yield* ownedNativePromise(
                "dev.telemetry.import-operation",
                () => import("./dev-telemetry-operation.js"),
              );
              const native = yield* ownedNativePromise(
                "dev.telemetry.import-native",
                () => import("./dev-telemetry-native.service.js"),
              );
              const authorities = yield* Layer.build(native.telemetryNativeLayer);
              return yield* operation
                .makeDevTelemetryEffect(root, configuration, onFailure)
                .pipe(Effect.provide(authorities), Effect.provideService(CliCleanup, cleanup));
            }),
          ),
      ),
    } satisfies TelemetryStorageOperations;
  }),
}) {}

/** Supplies lazy policy in the session's existing cleanup graph. */
export const telemetryStorageLayer = Layer.effect(CliTelemetryStorage, CliTelemetryStorage.make);
