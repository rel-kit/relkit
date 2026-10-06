import { Effect, Schema } from "effect";
import { validateGraphShapeEffect, type ApplicationGraph } from "@relkit/graph";
import { normalizeTelemetryConfigurationEffect } from "@relkit/observability";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryConfigurationSchema } from "./dev-telemetry-config.schemas.js";

/**
 * Reads telemetry only from an owner-validated compiler graph and exact configuration shape.
 * @param graphText - Compiler-produced graph bytes before admission to a dev generation.
 * @returns Configuration accepted by the model owner, or a typed admission failure.
 */
export const telemetryConfigurationFromGraphEffect = Effect.fn("DevTelemetry.graphConfiguration")(
  function* (graphText: string) {
    const value: unknown = yield* cliTry("dev.telemetry.graph-json", () => JSON.parse(graphText));
    yield* validateGraphShapeEffect(value).pipe(
      Effect.mapError((error) => cliAdapterError("dev.telemetry.graph", error)),
    );
    // Promotion follows the graph owner's complete void validator, retaining its source identity.
    const graph = value as ApplicationGraph;
    const configuration = yield* Schema.decodeUnknownEffect(telemetryConfigurationSchema)(
      graph.nodes.find((node) => node.kind === "app")?.telemetry ?? {},
      { onExcessProperty: "error" },
    ).pipe(Effect.mapError((error) => cliAdapterError("dev.telemetry.config-shape", error)));
    return yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
      Effect.mapError((error) =>
        cliAdapterError("dev.telemetry.config", new TypeError(error.message)),
      ),
    );
  },
  (effect) => observeCli("dev.telemetry.graph-configuration", effect),
);
