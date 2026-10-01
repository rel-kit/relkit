import {
  artifact,
  GENERATED_EXTENSION_VERSIONS,
  ArtifactValidationError,
  extensionArtifactEffect,
} from "./generated-artifact-validation.js";
import { observeCompiler } from "./observability.js";
import type {
  GeneratedExtensionKind,
  GeneratedOutputExtension,
  GeneratedArtifact,
  GeneratedArtifactsWriteOptions,
  GeneratedArtifactsWriteReport,
} from "./generated-artifacts.types.js";
export type {
  GeneratedExtensionKind,
  GeneratedOutputExtension,
  GeneratedArtifact,
  ArtifactWriteResult,
  GeneratedArtifactsWriteOptions,
  GeneratedArtifactsWriteReport,
} from "./generated-artifacts.types.js";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { Effect } from "effect";
import { runCompilerPromise } from "./compatibility.js";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import { JOBS_MANIFEST_VERSION } from "@relkit/contracts/jobs";
import { LOCAL_SERVICE_PLAN_FILE, LOCAL_SERVICE_PLAN_VERSION } from "@relkit/local-service";
import type { GeneratedOutputs } from "./normalize-types.js";
import { artifactIo, writeIfChangedEffect } from "./generated-artifacts-write.js";

export { writeIfChanged, writeIfChangedEffect } from "./generated-artifacts-write.js";
export const GENERATED_ARTIFACT_FILES = Object.freeze({
  graph: "application.graph.json",
  manifest: "runtime.manifest.ts",
  jobsManifest: "jobs.manifest.json",
  runtimeActivation: "runtime-activation.json",
  runtimeIntegrations: RUNTIME_INTEGRATION_PLAN_FILE,
  runtimeIntegrationImports: "runtime-integrations.ts",
  localServices: LOCAL_SERVICE_PLAN_FILE,
  diagnostics: "diagnostics.json",
  contract: "contract.ts",
  clientContract: "client-contract.json",
  clientRegistry: "client-registry.d.ts",
  clientManifest: "client-manifest.json",
} as const);
export const GENERATED_ARTIFACT_VERSIONS = Object.freeze({
  graph: GRAPH_VERSION,
  manifest: MANIFEST_VERSION,
  jobsManifest: JOBS_MANIFEST_VERSION,
  runtimeActivation: GENERATOR_VERSION,
  runtimeIntegrations: RUNTIME_INTEGRATION_PLAN_VERSION,
  runtimeIntegrationImports: GENERATOR_VERSION,
  localServices: LOCAL_SERVICE_PLAN_VERSION,
  diagnostics: CONTRACT_VERSION,
  contract: CONTRACT_VERSION,
  clientContract: CONTRACT_VERSION,
  clientRegistry: GENERATOR_VERSION,
  clientManifest: CONTRACT_VERSION,
  generator: GENERATOR_VERSION,
} as const);

const GENERATED_ARTIFACT_KINDS = [
  "graph",
  "manifest",
  "jobsManifest",
  "runtimeActivation",
  "runtimeIntegrations",
  "runtimeIntegrationImports",
  "localServices",
  "diagnostics",
  "contract",
  "clientContract",
  "clientRegistry",
  "clientManifest",
] as const;

/**
 * Builds compiler-owned artifacts without adding time or process metadata.
 * @param outputs - Exact source artifacts returned by compiler generation.
 * @returns Versioned compiler artifact contents without process or time-dependent metadata.
 */
export function generatedArtifacts(outputs: GeneratedOutputs): readonly GeneratedArtifact[] {
  return Object.freeze(
    GENERATED_ARTIFACT_KINDS.flatMap((kind) => {
      const content = outputs[kind];
      return content === undefined
        ? []
        : [artifact(GENERATED_ARTIFACT_FILES[kind], content, GENERATED_ARTIFACT_VERSIONS[kind])];
    }),
  );
}

/**
 * Creates the future OpenAPI/client/deployment extension seam with its pinned version.
 * @param kind - Descriptor or syntax category.
 * @param content - Exact generated UTF-8 content.
 * @returns The explicitly requested extension with its pinned contract version.
 */
export function createGeneratedOutputExtension(
  kind: GeneratedExtensionKind,
  content: string,
): GeneratedOutputExtension {
  if (typeof content !== "string") throw new TypeError("Generated artifact content must be text.");
  return Object.freeze({ kind, version: GENERATED_EXTENSION_VERSIONS[kind].version, content });
}

/**
 * Preflights extensions and publishes compiler artifacts in filename order.
 * @param outputs - Exact generated content, including optional outputs.
 * @param options - Destination directory and explicit versioned extensions.
 * @returns A lazy effect yielding a frozen report or typed validation/I/O failures.
 * @remarks Writes run concurrently after all metadata is validated; each write owns its cleanup.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { writeGeneratedArtifactsEffect } from "./generated-artifacts.js";
 * // outputs is the GeneratedOutputs returned by normalization.
 * const exit = await Effect.runPromise(Effect.exit(writeGeneratedArtifactsEffect(outputs, { directory: ".relkit/generated" })));
 * ```
 */
export const writeGeneratedArtifactsEffect = Effect.fn("Compiler.writeGeneratedArtifacts")(
  function* (outputs: GeneratedOutputs, options: GeneratedArtifactsWriteOptions) {
    const explicitExtensions = options.extensions ?? [];
    const extensionKinds = new Set<GeneratedExtensionKind>();
    for (const extension of explicitExtensions) {
      if (extensionKinds.has(extension.kind)) {
        return yield* new ArtifactValidationError({
          cause: new TypeError(
            `Generated ${extension.kind} extension was supplied more than once.`,
          ),
        });
      }
      extensionKinds.add(extension.kind);
    }
    // Validate explicit metadata before any asynchronous work can publish bytes.
    const explicitArtifacts = yield* Effect.forEach(explicitExtensions, extensionArtifactEffect);
    const contentExtensions = (yield* Effect.forEach(
      ["openapi", "client"] as const,
      (kind) =>
        Effect.gen(function* () {
          if (extensionKinds.has(kind)) return undefined;
          const content = outputs[kind];
          const filePath = join(options.directory, GENERATED_EXTENSION_VERSIONS[kind].fileName);
          if (
            content === "" &&
            !(yield* artifactIo("stat", filePath, () => stat(filePath)).pipe(
              Effect.map(() => true),
              Effect.catchTag("ArtifactIoError", (error) =>
                error.cause instanceof Error &&
                "code" in error.cause &&
                error.cause.code === "ENOENT"
                  ? Effect.succeed(false)
                  : Effect.fail(error),
              ),
            ))
          )
            return undefined;
          return createGeneratedOutputExtension(kind, content);
        }),
      { concurrency: 2 },
    )).filter((extension): extension is GeneratedOutputExtension => extension !== undefined);
    const artifacts = [
      ...generatedArtifacts(outputs),
      ...(yield* Effect.forEach(contentExtensions, extensionArtifactEffect)),
      ...explicitArtifacts,
    ].sort((left, right) => left.fileName.localeCompare(right.fileName));
    const results = yield* Effect.forEach(
      artifacts,
      (entry) => writeIfChangedEffect(join(options.directory, entry.fileName), entry.content),
      { concurrency: "unbounded" },
    );
    return Object.freeze({
      writes: Object.freeze(results),
      changed: results.some((result) => result.changed),
    });
  },
  (effect, outputs, options) => observeCompiler("generation", "writeGeneratedArtifacts", effect),
);

/**
 * Publishes generated artifacts at the legacy Promise boundary.
 * @param outputs - Exact generated content.
 * @param options - Destination directory and explicit extensions.
 * @returns A Promise settling after publication and cleanup, retaining original rejection values.
 * @see {@link writeGeneratedArtifactsEffect} for composition and execution.
 */
export function writeGeneratedArtifacts(
  outputs: GeneratedOutputs,
  options: GeneratedArtifactsWriteOptions,
): Promise<GeneratedArtifactsWriteReport> {
  return runCompilerPromise(
    writeGeneratedArtifactsEffect(outputs, options).pipe(Effect.mapError((error) => error.cause)),
  );
}

export {
  GENERATED_EXTENSION_VERSIONS,
  ArtifactValidationError,
} from "./generated-artifact-validation.js";
