import type { GeneratedOutputExtension, GeneratedArtifact } from "./generated-artifacts.types.js";

import { Effect, Schema } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

export const GENERATED_EXTENSION_VERSIONS = Object.freeze({
  openapi: Object.freeze({ fileName: "openapi.json", version: 1 }),
  client: Object.freeze({ fileName: "client.ts", version: 1 }),
  deploymentPlan: Object.freeze({ fileName: "deployment.plan.json", version: 1 }),
} as const);

/** Invalid artifact metadata, checked before filesystem publication starts. */
export class ArtifactValidationError extends Schema.TaggedError<ArtifactValidationError>()(
  "ArtifactValidationError",
  { cause: Schema.Defect() },
) {}

/**
 * Freezes one generated artifact's content and version metadata.
 * @param fileName - Compiler-owned destination filename.
 * @param content - Exact generated UTF-8 content.
 * @param version - Pinned artifact contract version.
 * @returns A frozen artifact retaining its exact filename, bytes, and version.
 */
export function artifact(fileName: string, content: string, version: number): GeneratedArtifact {
  return Object.freeze({ fileName, content, version });
}

/**
 * Checks a pinned extension version before artifact publication.
 * @param extension - Explicit versioned output extension to validate.
 * @returns A lazy effect yielding a frozen artifact or failing with ArtifactValidationError; getter defects propagate.
 */
export const extensionArtifactEffect = Effect.fn("Compiler.extensionArtifact")(
  function* (extension: GeneratedOutputExtension) {
    const expected = GENERATED_EXTENSION_VERSIONS[extension.kind];
    if (extension.version !== expected.version) {
      return yield* new ArtifactValidationError({
        cause: new TypeError(
          `Generated ${extension.kind} version ${extension.version} is unsupported; expected ${expected.version}. Regenerate with \`relkit check\`.`,
        ),
      });
    }
    if (typeof extension.content !== "string") {
      return yield* new ArtifactValidationError({
        cause: new TypeError(`Generated ${extension.kind} content must be text.`),
      });
    }
    return artifact(expected.fileName, extension.content, extension.version);
  },
  (effect) => observeCompiler("generation", "extensionArtifact", effect),
);

/** Validates extension metadata at the synchronous compatibility boundary. */
export function extensionArtifact(extension: GeneratedOutputExtension): GeneratedArtifact {
  return runCompilerSync(extensionArtifactEffect(extension));
}
