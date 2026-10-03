import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  isRuntimeActivationFingerprint,
} from "@relkit/contracts";
import { Effect, Schema } from "effect";
import type { EnvShape } from "@relkit/config";
import type { GenerationRuntimeOptions } from "./runtime.types.js";
import { observeExecution } from "./operation.js";

/** Typed configuration rejection retaining the original public TypeError. */
export class GenerationConfigurationError extends Schema.TaggedError<GenerationConfigurationError>()(
  "GenerationConfigurationError",
  { cause: Schema.Defect() },
) {}

/**
 * Validates generation compatibility before acquiring resources.
 * @typeParam S - The configured environment field shape.
 * @param options - Graph, manifest and explicit environment configuration.
 * @returns Lazy validation with typed configuration failures and preserved defects.
 */
export const validateGenerationOptionsEffect = Effect.fn("Generation.validate")(
  <S extends EnvShape>(options: GenerationRuntimeOptions<S>) =>
    observeExecution(
      "runtime",
      "generation.validate",
      Effect.try({
        try: () => validateGenerationOptions(options),
        catch: (cause) => {
          if (cause instanceof TypeError) return new GenerationConfigurationError({ cause });
          throw cause;
        },
      }),
    ),
);

/**
 * Enforces version/fingerprint constraints at the synchronous startup boundary.
 * @typeParam S - The environment definition's field shape.
 * @param options - Explicit generation configuration.
 * @returns Nothing when all runtime cohort checks pass.
 * @throws TypeError when the compiled cohort or environment policy is incompatible.
 */
export function validateGenerationOptions<S extends EnvShape>(
  options: GenerationRuntimeOptions<S>,
): void {
  if (options.environment === "production" && options.allowImplicitDotEnv === true) {
    throw new TypeError("Production generations require explicit environment values");
  }
  version(options.graph.contractVersion, GRAPH_VERSION, "graph contract");
  version(options.manifest.contractVersion, MANIFEST_VERSION, "runtime manifest");
  version(options.manifest.generatorVersion, GENERATOR_VERSION, "runtime manifest generator");
  version(
    options.manifest.runtimeIntegrationsPlan?.version,
    RUNTIME_INTEGRATION_PLAN_VERSION,
    "runtime-integration plan",
  );
  if (
    options.manifest.runtimeIntegrationsPlan.fileName !== RUNTIME_INTEGRATION_PLAN_FILE ||
    options.manifest.runtimeIntegrationsPlan.graphHash !== options.graphHash
  )
    throw new TypeError(
      "Runtime-integration plan reference does not match the application graph; rebuild with `relkit build`.",
    );
  if (
    !isRuntimeActivationFingerprint(options.manifest.activationFingerprint) ||
    options.manifest.activationFingerprint.graphHash !== options.graphHash
  )
    throw new TypeError("Runtime activation fingerprint is invalid; rebuild with `relkit build`.");
  if (options.manifest.graphHash !== options.graphHash)
    throw new TypeError("Runtime manifest graph hash does not match the application graph");
}

/**
 * Checks one compiled version without coercion.
 * @param actual - Version read from the artifact.
 * @param expected - Supported version.
 * @param label - Human-readable artifact description.
 * @returns Nothing for a supported version.
 * @throws TypeError when versions differ.
 */
function version(actual: unknown, expected: number, label: string): void {
  if (actual !== expected)
    throw new TypeError(
      `${label} version ${String(actual)} is unsupported; expected ${expected}. Rebuild with \`relkit build\`.`,
    );
}
