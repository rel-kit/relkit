/**
 * Copies application server/deployment metadata and validates optional inspection
 * selection before descriptor freezing. These pure authoring effects acquire no
 * listeners or providers; invalid input retains the public validation cause.
 */
import { normalizeInspectorConfiguration } from "../contracts/index.js";
import { Effect } from "effect";
import { observeApp } from "./app-observability.js";
import { copyEffect } from "./app-provider-normalization.js";
import { AppValidationFailure } from "./app-validation.js";
import type { ApplicationDescriptor } from "./define-app.types.js";

/**
 * Normalizes immutable runtime policy without starting its selected features.
 * @param options - Optional server, bridge and deployment authoring metadata.
 * @returns Lazy metadata copies, failing with AppValidationFailure on invalid input.
 */
export const normalizeAppRuntimeMetadataEffect = Effect.fn("App.runtimeMetadata")(
  (options: Pick<ApplicationDescriptor, "server" | "inspector" | "deployment" | "check">) =>
    observeApp(
      "runtimeMetadata.normalize",
      Effect.gen(function* () {
        const server =
          options.server === undefined ? undefined : yield* copyServerEffect(options.server);
        const inspector =
          options.inspector === undefined
            ? undefined
            : yield* Effect.fromResult(normalizeInspectorConfiguration(options.inspector)).pipe(
                Effect.mapError(
                  (error) => new AppValidationFailure({ message: error.message, cause: error }),
                ),
              );
        const deployment =
          options.deployment === undefined ? undefined : yield* copyEffect(options.deployment);
        const check = options.check === undefined ? undefined : yield* copyEffect(options.check);
        return { server, inspector, deployment, check };
      }),
    ),
);

/** Copies server settings as JSON data and keeps the `onStart` callback as written.
 * @param server - Authored server settings.
 * @returns The copied settings, or AppValidationFailure when `onStart` is not a function.
 */
function copyServerEffect(server: NonNullable<ApplicationDescriptor["server"]>) {
  return Effect.gen(function* () {
    const { onStart, ...data } = server;
    if (onStart !== undefined && typeof onStart !== "function")
      return yield* new AppValidationFailure({
        message: "server.onStart must be a function",
        cause: new TypeError("server.onStart must be a function"),
      });
    const copied = yield* copyEffect(data);
    return onStart === undefined ? copied : { ...copied, onStart };
  });
}
