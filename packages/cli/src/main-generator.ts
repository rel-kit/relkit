/** Lazily loads CLI-owned scaffolding after command selection, validates the retained generator facade and preserves the public unavailable-API diagnostic. */

import { Effect, Layer } from "effect";
import { cliPromise, cliAdapterError, CliFailureError } from "./cli-errors.js";
import { runCliEffect } from "./cli-runtime.js";
import type { CreateRelkitGeneratorApi } from "./main-support-types.js";

/**
 * Imports the optional generator using the existing public Promise contract.
 * @returns The original module API identity.
 * @throws The established unavailable-API failure.
 */
export function loadCreateRelkit(): Promise<CreateRelkitGeneratorApi> {
  return runCliEffect(loadCreateRelkitEffect, Layer.empty);
}

/** Imports one foreign namespace lazily without creating a nested command runtime. */
export const loadCreateRelkitEffect = cliPromise(
  "generator.import",
  () => import("./scaffolding/index.js"),
).pipe(
  Effect.mapError(() => cliAdapterError("generator.import", unavailableGenerator())),
  Effect.flatMap((loaded) => {
    const value = "default" in loaded ? (loaded.default ?? loaded) : loaded;
    return isGeneratorApi(value)
      ? Effect.succeed(value)
      : Effect.fail(cliAdapterError("generator.import", unavailableGenerator()));
  }),
);

/**
 * Validates the minimal foreign facade while preserving its original identity.
 * @param value - Untrusted imported namespace or caller substitute.
 * @returns Whether the existing required operations are present.
 */
export function isGeneratorApi(value: unknown): value is CreateRelkitGeneratorApi {
  if (value === null || typeof value !== "object") return false;
  return (
    "normalizeCreateOptions" in value &&
    typeof value.normalizeCreateOptions === "function" &&
    "generateProject" in value &&
    typeof value.generateProject === "function"
  );
}
/** Constructs the established unavailable generator failure at the lazy import boundary.
 * @returns The original product code, message and exit status.
 */
function unavailableGenerator() {
  return new CliFailureError({
    code: "RELKIT_CREATE_API_UNAVAILABLE",
    message: "The create-relkit generator API is unavailable.",
    exitCode: 1,
  });
}
